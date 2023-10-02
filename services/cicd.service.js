
const ConfigLoader = require("config-mixin");
const { MoleculerClientError } = require("moleculer").Errors;

/**
 * this service manages the cicd api and webhooks
 * 
 * webhocks used to update paas-shack deployments
 */
module.exports = {
    name: "cicd",
    version: 1,

    mixins: [
        ConfigLoader(['cicd.**']),
    ],

    /**
     * Service dependencies
     */
    dependencies: [

    ],

    /**
     * Service settings
     */
    settings: {
        rest: "v1/cicd",

        config: {
            'cicd.enabled': false,
        }
    },

    /**
     * Actions
     */

    actions: {
        /**
         * process package publish event
         * 
         * @actions
         * @param {String} name - name of package
         * @param {String} namespace - namespace of package
         * @param {String} version - version of package
         * @param {String} url - url of package
         * @param {String} branch - branch of package
         * @param {String} repository - repository of package
         * @param {String} registry - registry of package
         * 
         * @returns {Object} - package
         */
        publish: {
            rest: {
                method: "POST",
                path: "/publish"
            },
            permissions: ['cicd.publish'],
            params: {
                name: {
                    type: "string",
                    min: 3,
                    max: 255,
                },
                namespace: {
                    type: "string",
                    min: 3,
                    max: 255,
                },
                version: {
                    type: "string",
                    min: 3,
                    max: 255,
                },
                branch: {
                    type: "string",
                    min: 3,
                    max: 255,
                },
                url: {
                    type: "string",
                    min: 3,
                    max: 255,
                    optional: true,
                },
                repository: {
                    type: "string",
                    min: 3,
                    max: 255,
                    optional: true,
                },
                registry: {
                    type: "string",
                    min: 3,
                    max: 255,
                    optional: true,
                },
            },
            async handler(ctx) {
                const params = Object.assign({}, ctx.params);

                // if registry is not set
                if (!params.registry) {
                    // set registry to docker hub
                    params.registry = "docker.io";
                }

                // if repository is not set
                if (!params.repository) {
                    // set repository to namespace/name
                    params.repository = `${params.namespace}/${params.name}`;
                }

                // if url is not set
                if (!params.url) {
                    // set url to registry/repository:branch
                    params.url = `${params.registry}/${params.repository}:${params.branch}`;
                }

                return this.processGithubPublish(ctx, params);
            }
        },

    },

    /**
     * Events
     */
    events: {
        /**
         * github.package.published
         * {
                name: 'github',
                namespace: 'paas-shack',
                branch: 'main',
                sha256: '33c412d60a4c70da20f50413c80b3d6c32cb83a1d33c3c236f1af9395fb47e00',
                url: 'ghcr.io/paas-shack/github:sha256-c3438d76273dafc73df9cfc6a6def759c1f1dff95a3ea7ab51c973f28521c265.sig'
            }
         */
        async "github.package.published"(ctx) {
            const package = ctx.params;

            this.logger.info(`github.package.published`, package);

            if (!this.config['cicd.enabled']) {
                this.logger.info("CICD is disabled");
                return;
            }

            // match branch pachage
            if (!package.url.includes(`:${package.branch}`)) {
                this.logger.info(`branch does not match package url`);
                return;
            }

            await this.processGithubPublish(ctx, package);
        },
    },

    /**
     * Methods
     */
    methods: {
        /**
         * process github publish event
         * 
         * @param {Object} ctx - context
         * @param {Object} package - package
         */
        async processGithubPublish(ctx, package) {

            // get the deployment
            const deployment = await ctx.call("v1.cicd.deployments.package", {
                name: package.name,
                namespace: package.namespace,
                branch: package.branch,
            });


            // if deployment exists
            if (deployment) {
                if (!this.config['cicd.dirtyPatch']) {
                    this.logger.info("Dirty patch has been deiabled");
                    return;
                }
                // dirty patch deployment
                await this.patchDeploymentImage(ctx, package, deployment);
            } else {
                // else log deployment does not exist
                this.logger.info(`deployment does not exist`, package);
            }
        },

        /**
         * patch kube deplaymant image
         * 
         * @param {Object} ctx - context
         * @param {Object} package - package 
         * @param {Object} deployment - deployment
         */
        async patchDeploymentImage(ctx, package, deployment) {

            // fetch k8s deploymant
            const resource = await ctx.call('v1.kube.readNamespacedDeployment', {
                name: package.name,
                namespace: package.namespace,
                cluster: deployment.cluster
            });

            // if resource does not exist
            if (!resource) {
                this.logger.info(`deployment does not exist`, package);
                return;
            }

            const image = this.getImageUrl(package);

            const body = {
                spec: {
                    template: {
                        spec: {
                            containers: [resource.spec.template.spec.containers[0]]
                        }
                    }
                }
            };

            // check if image is already set
            if (image === resource.spec.template.spec.containers[0].image) {
                this.logger.info(`image is already set to ${image}`);
                return;
            }

            // update image
            body.spec.template.spec.containers[0].image = image;

            this.logger.info(`patching deployment image to ${image}`, deployment);

            // patch deployment
            return ctx.call('v1.kube.patchNamespacedDeployment', {
                name: deployment.name,
                namespace: deployment.namespace,
                cluster: deployment.cluster,
                body: body
            });
        },

        /**
         * create new image version from template
         * 
         * @param {Object} ctx - context
         * @param {Object} package - package 
         * @param {Object} deployment - deployment
         */
        async createImageVersion(ctx, package, deployment) {
            // create new k8s image version based off deployment template
            const template = await ctx.call("v1.k8s.images.resolve", {
                id: deployment.template,
            });

            // if template exists
            if (template) {
                // create new image version
                const imageconfig = {
                    ...template,
                    name: package.name,
                    namespace: package.namespace,
                    tag: package.version,
                    digest: `sha256:${package.version}`,
                    image: this.getImageUrl(package),
                    registry: package.registry,
                    repository: package.repository,
                };

                // remove id from imageconfig
                delete imageconfig.id;

                const image = await ctx.call("v1.k8s.images.create", imageconfig);

                // update deployment image version
                await ctx.call("v1.k8s.deployments.update", {
                    id: deployment.id,
                    image: image.id,
                    version: deployment.version + 1,
                });

                // log
                this.logger.info(`updated deployment`, package);
            } else {
                // else log template does not exist
                this.logger.info(`template does not exist`, package);
            }
        },

        /**
         * get image url from package
         * 
         * @param {Object} package - package object
         * 
         * @returns {String} - image url
         */
        getImageUrl(package) {
            //patch package.url to remove registry
            return package.url.replace(`:${package.branch}`, `@sha256:${package.sha256}`);
        }
    },

    /**
     * Service created lifecycle event handler
     */
    created() { },

    /**
     * Service started lifecycle event handler
     */
    async started() { },

    /**
     * Service stopped lifecycle event handler
     */
    async stopped() { }
};