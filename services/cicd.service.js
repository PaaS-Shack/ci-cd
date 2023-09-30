"use strict";
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
            'cicd.enabled': false
        }
    },

    /**
     * Actions
     */

    actions: {


    },

    /**
     * Events
     */
    events: {
        /**
         * github.package.published
         * { 
         * name: 'github', 
         * namespace: 'paas-shack', 
         * version: 'sha256:6ab71b283cfa70526505c153c6cb1d6a74747b52a3665828babb1fa83120f33e', 
         * url: 'ghcr.io/paas-shack/github:main', 
         * branch: 'main', 
         * repository: 'PaaS-Shack/github', 
         * registry: 'ghcr.io' 
         * }
         */
        async "github.package.published"(ctx) {
            const Package = ctx.params;

            if (!this.config['cicd.enabled']) {
                this.logger.info("CICD is disabled");
                return;
            }

            await this.processGithubPublish(ctx, Package);
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
                if (deployment.patch) {
                    if (!this.config['cicd.dirtyPatch']) {
                        this.logger.info("Dirty patch has been deiabled");
                        return;
                    }
                    // dirty patch deployment
                    await this.patchDeploymentImage(ctx, package, deployment);
                } else {
                    // create new k8s image version based off deployment template
                    await this.createImageVersion(ctx, package, deployment);
                }
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

            const patch = {
                spec: {
                    template: {
                        spec: {
                            containers: [{
                                image: this.getImageUrl(package)
                            }]
                        }
                    }
                }
            };

            return ctx.call('v1.kube.patchNamespacedDeployment', {
                name: deployment.name,
                namespace: deployment.namespace,
                cluster: deployment.cluster,
                body: patch
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
            return `${package.registry}/${package.repository}@sha256:${package.version}`
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