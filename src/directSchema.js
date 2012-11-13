var _ = require('underscore');


var pathParts = function(path) {
    if(path == "") return [];
    return path.split("/");
}

var applyPath;
applyPath = function(data, path) {
    if(path.length == 0) return data;
    return applyPath(data[path[0]], path.slice(1));
}

var directSchema = function(schema) {
    var validators = {};
    
    var visitQueue = [""];
    while(visitQueue.length > 0) {
        var schemaPath = visitQueue.shift();
        if(!_.isUndefined(validators[schemaPath])) continue;
        
        var localSchema = applyPath(schema, pathParts(schemaPath));
        
        _.each(["additionalProperties"], function(superkey) {
            if(_.isObject(localSchema[superkey])) {
                var subpath = superkey;
                if(schemaPath != "") subpath = schemaPath + "/" + subpath;
                visitQueue = _.flatten([visitQueue, [subpath]], true);
            }
        });
        
        _.each(["extends"], function(superkey) {
            if(_.isArray(localSchema[superkey])) {
                visitQueue = _.flatten([visitQueue,
                _.map(_.range(localSchema[superkey]), function(index) {
                    var subpath = superkey + "/" + index;
                    if(schemaPath != "") subpath = schemaPath + "/" + subpath;
                    return subpath;
                })], true);
            } else if(_.isObject(localSchema[superkey])) {
                var subpath = superkey;
                if(schemaPath != "") subpath = schemaPath + "/" + subpath;
                visitQueue = _.flatten([visitQueue, [subpath]], true);
            }
        });
        
        _.each(["properties", "patternProperties", "definitions"], function(superkey) {
            if(_.isObject(localSchema[superkey])) {
                visitQueue = _.flatten([visitQueue,
                _.map(_.keys(localSchema[superkey]), function(key) {
                    var subpath = superkey + "/" + key;
                    if(schemaPath != "") subpath = schemaPath + "/" + subpath;
                    return subpath;
                })], true);
            }
        });
        
        validators[schemaPath] = (function(schemaPath, localSchema) {
        return function(data, errorHandler, dataPath) {
            if(_.isUndefined(dataPath)) dataPath = "";
            
            var valid = true;
            var errors = [];
            var inPart = _.isString(localSchema.title) ? " in " + localSchema.title : "";
            var errorTemplate = {
                dataPath: dataPath,
                schemaPath: schemaPath,
                schemaTitle: localSchema.title,
                schemaDescription: localSchema.description,
                data: data,
                schema: localSchema,
            };
            
            var allowedTypes = localSchema.type || "any";
            if(_.isString(allowedTypes)) allowedTypes = [allowedTypes];
            if(_.contains(allowedTypes, "any"))
                allowedTypes = ["string", "number", "integer", "boolean",
                                "object", "array", "null"];
            
            if(_.isNull(data)) {
                if(!_.contains(allowedTypes, "null")) {
                    errorHandler(_.extend({
                        message: "Null not allowed" + inPart + ".",
                    }, errorTemplate));
                }
            } else if(_.isBoolean(data)) {
                if(!_.contains(allowedTypes, "boolean")) {
                    errorHandler(_.extend({
                        message: "Boolean not allowed" + inPart + ".",
                    }, errorTemplate));
                }
            } else if(_.isNumber(data)) {
                if(_.isNaN(data) || !_.isFinite(data) || (data % 1 != 0)) {
                    if(!_.contains(allowedTypes, "number")) {
                        errorHandler(_.extend({
                            message: "Float not allowed" + inPart + ".",
                        }, errorTemplate));
                    }
                } else {
                    if(!_.contains(allowedTypes, "number")
                       && !_.contains(allowedTypes, "integer"))
                    {
                        errorHandler(_.extend({
                            message: "Integer not allowed" + inPart + ".",
                        }, errorTemplate));
                    }
                }
            } else if(_.isString(data)) {
                if(!_.contains(allowedTypes, "string")) {
                    errorHandler(_.extend({
                        message: "String not allowed" + inPart + ".",
                    }, errorTemplate));
                }
            } else if(_.isArray(data)) {
                if(!_.contains(allowedTypes, "array")) {
                    errorHandler(_.extend({
                        message: "Array not allowed" + inPart + ".",
                    }, errorTemplate));
                }
            } else if(_.isObject(data)) {
                if(!_.contains(allowedTypes, "object")) {
                    errorHandler(_.extend({
                        message: "Object not allowed" + inPart + ".",
                    }, errorTemplate));
                }
                
                _.each(data, function(subdata, key) {
                    var subpath = null;
                    var additionalProperties = true;
                    
                    if(!_.isUndefined(localSchema.properties)
                       && !_.isUndefined(localSchema.properties[key]))
                    {
                        subpath = "properties/" + key;
                    }
                    
                    if(_.isNull(subpath) && !_.isUndefined(localSchema.patternProperties)) {
                        _.each(_.keys(localSchema.patternProperties), function(pattern) {
                            if(!_.isNull(subpath)) return;
                            
                            if(key.match(pattern)) {
                                subpath = "patternProperties/" + pattern;
                            }
                        });
                    }
                    
                    if(_.isNull(subpath) && !_.isUndefined(localSchema.additionalProperties)) {
                        if(_.isBoolean(localSchema.additionalProperties)) {
                            additionalProperties = localSchema.additionalProperties;
                        } else {
                            subpath = "additionalProperties";
                        }
                    }
                    
                    if(!_.isNull(subpath)) {
                        if(schemaPath != "") subpath = schemaPath + "/" + subpath;
                        
                        dataSubpath = key;
                        if(dataPath != "") dataSubpath = dataPath + "/" + dataSubpath;
                        
                        var subresult = validators[subpath](subdata, errorHandler, dataSubpath);
                        
                        if(!subresult.valid) valid = false;
                        errors = _.flatten([errors, subresult.errors], true);
                    } else if(!additionalProperties) {
                        errorHandler(_.extend({
                            message: "Property " + key + " not allowed" + inPart + ".",
                            property: key,
                        }, errorTemplate));
                    }
                });
            } else {
                errorHandler(_.extend({
                    message: "Non-JSON value not allowed" + inPart + ".",
                }, errorTemplate));
            }
            
            if(!_.isUndefined(localSchema.extends)) {
                var subpaths;
                if(_.isArray(localSchema.extends)) {
                    subpaths = _.map(_.range(localSchema.extends.length), function(index) {
                        return "extends/" + index;
                    });
                } else {
                    subpaths = ["extends"];
                }
                
                _.each(subpaths, function(subpath) {
                    if(schemaPath != "") subpath = schemaPath + "/" + subpath;
                    
                    var subresult = validators[subpath](data, errorHandler, dataPath);
                    
                    if(!subresult.valid) valid = false;
                    errors = _.flatten([errors, subresult.errors], true);
                });
            }
            
            return {
                data: data,
                valid: valid,
                errors: errors,
            };
        };})(schemaPath, localSchema);
    }
    
    return validators[""];
};


module.exports = directSchema;
