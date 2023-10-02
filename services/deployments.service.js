const DbService = require("db-mixin");
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

            // package name
            name: {
                type: "string",
                min: 3,
                max: 255,
                required: true,
            },

            // package namespace
            namespace: {
                type: "string",
                min: 3,
                max: 255,
                required: true,
            },

            // package version
            version: {
                type: "string",
                min: 3,
                max: 255,
                required: true,
            },

            cluster: {
                type: "string",
                min: 3,
                max: 255,
                required: false,
                default: "default",
            },

            // git remote repository
            remote: {
                type: "object",
                props: {
                    name: {
                        type: "string",
                        min: 3,
                        max: 255,
                        required: true,
                    },
                    namespace: {
                        type: "string",
                        min: 3,
                        max: 255,
                        required: true,
                    },
                    branch: {
                        type: "string",
                        min: 3,
                        max: 255,
                        required: true,
                    },
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
                const params = Object.assign({}, ctx.params)
                // get the package
                const package = await this.findEntity(ctx, {
                    query: {
                        remote: {
                            name: params.name,
                            namespace: params.namespace,
                            branch: params.branch,
                        }
                    },
                    // scope: '-memebership'
                });


                // if package does not exist
                if (!package) {
                    return package;
                    // throw new MoleculerClientError("Package not found", 404);
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



