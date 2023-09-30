"use strict";

const DbService = require("db-mixin");
const Cron = require("cron-mixin");
const Membership = require("membership-mixin");
const ConfigLoader = require("config-mixin");
const { MoleculerClientError } = require("moleculer").Errors;


/**
 * 
 */

module.exports = {
    // name of service
    name: "cicd.deployments",
    // version of service
    version: 1,

    /**
     * Service Mixins
     * 
     * @type {Array}
     * @property {DbService} DbService - Database mixin
     * @property {ConfigLoader} ConfigLoader - Config loader mixin
     */
    mixins: [
        DbService({
            permissions: 'cicd.deployments'
        }),
        Membership({
            permissions: 'cicd.deployments'
        }),
        ConfigLoader(['cicd.**']),
    ],

    /**
     * Service dependencies
     */
    dependencies: [],

    /**
     * Service settings
     * 
     * @type {Object}
     */
    settings: {
        rest: true,

        fields: {

            // name of deployment
            name: {
                type: "string",
                required: true,
                unique: true,
                min: 3,
                max: 255,
            },

            // namespace of deployment
            namespace: {
                type: "string",
                required: true,
                min: 3,
                max: 255,
            },

            // version of deployment
            version: {
                type: "string",
                required: true,
                min: 3,
                max: 255,
            },

            // url of deployment
            url: {
                type: "string",
                required: true,
                min: 3,
                max: 255,
            },

            // branch of deployment
            branch: {
                type: "string",
                required: true,
                min: 3,
                max: 255,
            },

            // repository of deployment
            repository: {
                type: "string",
                required: true,
                min: 3,
                max: 255,
            },

            // registry of deployment
            registry: {
                type: "string",
                required: true,
                min: 3,
                max: 255,
            },

            // cluster name
            cluster: {
                type: "string",
                required: false,
                default: "default"
            },

            // status of deployment
            status: {
                type: "string",
                required: false,
                enum: ["active", "inactive"],
            },

            // dirty patch
            patch: {
                type: "boolean",
                required: false,
                default: false,
            },

            // deployment image
            image: {
                type: "string",
                required: false,
                populate: {
                    action: "v1.k8s.images.get",
                },
            },

            // image template
            template: {
                type: "string",
                required: false,
                populate: {
                    action: "v1.k8s.images.get",
                },
            },

            // k8s.deployments id
            deployment: {
                type: "string",
                required: false,
                populate: {
                    action: "v1.k8s.deployments.get",
                },
            },



            ...DbService.FIELDS,// inject dbservice fields
            ...Membership.FIELDS,// inject membership fields
        },
        defaultPopulates: [],

        scopes: {
            ...DbService.SCOPE,
            ...Membership.SCOPE,
        },

        defaultScopes: [...DbService.DSCOPE, ...Membership.DSCOPE],

        // default init config settings
        config: {

        }
    },

    /**
     * service actions
     */
    actions: {
        /**
         * resolve package
         * 
         * @actions
         * @param {String} name - name of package
         * @param {String} namespace - namespace of package
         * @param {String} branch - branch of package
         * 
         * @returns {Object} package
         */
        package: {
            rest: {
                method: "GET",
                path: "/:namespace/:name/:branch",
            },
            params: {
                name: { type: "string", min: 3, max: 255 },
                namespace: { type: "string", min: 3, max: 255 },
                branch: { type: "string", min: 3, max: 255 },
            },
            async handler(ctx) {
                // get the package
                const package = await this.findEntity(null, {
                    query: {
                        name: ctx.params.name,
                        namespace: ctx.params.namespace,
                        branch: ctx.params.branch,
                    },
                    scope: '-memebership'
                });

                // if package does not exist
                if (!package) {
                    throw new MoleculerClientError("Package not found", 404);
                }

                // return the package
                return package;
            },
        },
    },

    /**
     * service events
     */
    events: {

    },

    /**
     * service methods
     */
    methods: {

    }

}



