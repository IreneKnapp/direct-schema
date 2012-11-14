var _ = require('underscore');


var pathParts = function(path) {
    if(path == "/") return [];
    return path.split("/").slice(1);
}

var applyPath;
applyPath = function(data, path) {
    if(path.length == 0) return data;
    return applyPath(data[path[0]], path.slice(1));
}

var isLink;
isLink = function(string) {
    if(/^#/.test(link)) {
        return true;
    } else {
        return false;
    }
}

var resolveLink;
resolveLink = function(link, base) {
    if(link == "#") {
        return "/";
    } else if(/^#\//.test(link)) {
        return /^#(.*)$/.exec(link)[1];
    } else if(/^#/.test(link)) {
        return base + "/" + /^#(.*)$/.exec(link)[1];
    } else {
        return null;
    }
}

var equal;
equal = function(a, b) {
    if(_.isNull(a) && _.isNull(b)) {
        return true;
    } else if(_.isBoolean(a) && _.isBoolean(b)) {
        return a == b;
    } else if(_.isNumber(a) && _.isNumber(b)) {
        return a == b;
    } else if(_.isString(a) && _.isString(b)) {
        return a == b;
    } else if(_.isArray(a) && _.isArray(b)) {
        if(a.length != b.length) return false;
        for(var i = 0; i < a.length; i++) {
            if(!equal(a[i], b[i])) return false;
        }
        return true;
    } else if(_.isObject(a) && _.isObject(b)) {
        var keysA = _.keys(a);
        var keysB = _.keys(b);
        if(_.difference(keysA, keysB).length > 0) return false;
        if(_.difference(keysB, keysA).length > 0) return false;
        for(var i = 0; i < keysA.length; i++) {
            var key = keysA[i];
            if(!equal(a[key], b[key])) return false;
        }
        return true;
    } else {
        return false;
    }
}

var directSchema = function(schema) {
    var validators = {};
    
    var visitQueue = ["/"];
    while(visitQueue.length > 0) {
        var schemaPath = visitQueue.shift();
        if(!_.isUndefined(validators[schemaPath])) continue;
        
        var localSchema = applyPath(schema, pathParts(schemaPath));
        
        _.each(["additionalProperties"], function(superkey) {
            if(_.isObject(localSchema[superkey])) {
                var subpath = "/" + superkey;
                if(schemaPath != "/") subpath = schemaPath + subpath;
                visitQueue = _.flatten([visitQueue, [subpath]], true);
            }
        });
        
        _.each(["extends"], function(superkey) {
            if(_.isArray(localSchema[superkey])) {
                visitQueue = _.flatten([visitQueue,
                _.map(_.range(localSchema[superkey]), function(index) {
                    var subpath = "/" + superkey + "/" + index;
                    if(schemaPath != "/") subpath = schemaPath + subpath;
                    return subpath;
                })], true);
            } else if(_.isObject(localSchema[superkey])) {
                var subpath = "/" + superkey;
                if(schemaPath != "/") subpath = schemaPath + subpath;
                visitQueue = _.flatten([visitQueue, [subpath]], true);
            }
        });
        
        _.each(["properties", "patternProperties", "definitions"], function(superkey) {
            if(_.isObject(localSchema[superkey])) {
                visitQueue = _.flatten([visitQueue,
                _.map(_.keys(localSchema[superkey]), function(key) {
                    var subpath = "/" + superkey + "/" + key;
                    if(schemaPath != "/") subpath = schemaPath + subpath;
                    return subpath;
                })], true);
            }
        });
        
        validators[schemaPath] = (function(schemaPath, localSchema) {
        return function(data, errorHandler, dataPath) {
            if(_.isUndefined(dataPath)) dataPath = "/";
            
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
            
            var emitError = function(options) {
                var error = _.extend(options, errorTemplate);
                valid = false;
                errors.push(error);
                if(!_.isNull(errorHandler)) errorHandler(error);
            };
            
            if(!_.isUndefined(localSchema.$ref)) {
                var subpath = resolveLink(localSchema.$ref, schemaPath);
                
                if(!_.isNull(subpath)) {
                    var subschema = applyPath(schema, pathParts(subpath));
                    if(_.isString(subschema))
                        subpath = resolveLink(subschema, schemaPath);
                }
                
                if(!_.isNull(subpath) && !_.isUndefined(validators[subpath])) {
                    var subresult = validators[subpath](data, errorHandler, dataPath);
                    
                    if(!subresult.valid) valid = false;
                    errors = _.flatten([errors, subresult.errors], true);
                } else {
                    emitError({
                        message: "Referenced schema with URL " + localSchema.$ref + " not found.",
                        reference: localSchema.$ref,
                    });
                }
            } else {
                var allowedTypes = localSchema.type || "any";
                if(_.isString(allowedTypes)) allowedTypes = [allowedTypes];
                var allowedSchemas = _.filter(allowedTypes, isLink);
                allowedTypes = _.reject(allowedTypes, isLink);
                if(_.contains(allowedTypes, "any"))
                    allowedTypes = ["string", "number", "integer", "boolean",
                                    "object", "array", "null"];
                
                /*
                var errorGroups = [];
                
                _.each(allowedSchemas, function(allowedSchema) {
                    // ... IAK
                });
                */
                
                if(_.isNull(data)) {
                    if(!_.contains(allowedTypes, "null")) {
                        emitError({
                            message: "Null not allowed" + inPart + ".",
                        });
                    }
                } else if(_.isBoolean(data)) {
                    if(!_.contains(allowedTypes, "boolean")) {
                        emitError({
                            message: "Boolean not allowed" + inPart + ".",
                        });
                    }
                } else if(_.isNumber(data)) {
                    if(_.isNaN(data) || !_.isFinite(data) || (data % 1 != 0)) {
                        if(!_.contains(allowedTypes, "number")) {
                            emitError({
                                message: "Float not allowed" + inPart + ".",
                            });
                        }
                    } else {
                        if(!_.contains(allowedTypes, "number")
                           && !_.contains(allowedTypes, "integer"))
                        {
                            emitError({
                                message: "Integer not allowed" + inPart + ".",
                            });
                        }
                    }
                } else if(_.isString(data)) {
                    if(!_.contains(allowedTypes, "string")) {
                        emitError({
                            message: "String not allowed" + inPart + ".",
                        });
                    } else {
                        if(!_.isUndefined(localSchema.pattern)) {
                            var regexp = new RegExp(localSchema.pattern);
                            if(!regexp.test(data)) {
                                emitError({
                                    message: "String doesn't match pattern" + inPart + ".",
                                    pattern: localSchema.pattern,
                                });
                            }
                        }
                        
                        if(!_.isUndefined(localSchema.minLength)) {
                            if(data.length < localSchema.minLength) {
                                emitError({
                                    message: "String doesn't meet minimum length" + inPart + ".",
                                    actualLength: data.length,
                                    minimumLength: localSchema.minLength,
                                });
                            }
                        }
                        
                        if(!_.isUndefined(localSchema.maxLength)) {
                            if(data.length > localSchema.maxLength) {
                                emitError({
                                    message: "String exceeds maximum length" + inPart + ".",
                                    actualLength: data.length,
                                    maximumLength: localSchema.maxLength,
                                });
                            }
                        }
                    }
                } else if(_.isArray(data)) {
                    if(!_.contains(allowedTypes, "array")) {
                        emitError({
                            message: "Array not allowed" + inPart + ".",
                        });
                    }
                } else if(_.isObject(data)) {
                    if(!_.contains(allowedTypes, "object")) {
                        emitError({
                            message: "Object not allowed" + inPart + ".",
                        });
                    }
                    
                    _.each(data, function(subdata, key) {
                        var subpath = null;
                        var additionalProperties = true;
                        
                        if(!_.isUndefined(localSchema.properties)
                           && !_.isUndefined(localSchema.properties[key]))
                        {
                            subpath = "/properties/" + key;
                        }
                        
                        if(_.isNull(subpath) && !_.isUndefined(localSchema.patternProperties)) {
                            _.each(_.keys(localSchema.patternProperties), function(pattern) {
                                if(!_.isNull(subpath)) return;
                                
                                if(key.match(pattern)) {
                                    subpath = "/patternProperties/" + pattern;
                                }
                            });
                        }
                        
                        if(_.isNull(subpath) && !_.isUndefined(localSchema.additionalProperties)) {
                            if(_.isBoolean(localSchema.additionalProperties)) {
                                additionalProperties = localSchema.additionalProperties;
                            } else {
                                subpath = "/additionalProperties";
                            }
                        }
                        
                        if(!_.isNull(subpath)) {
                            if(schemaPath != "/") subpath = schemaPath + subpath;
                            
                            var subschema = applyPath(schema, pathParts(subpath));
                            if(_.isString(subschema))
                                subpath = resolveLink(subschema, schemaPath);
                            
                            dataSubpath = "/" + key;
                            if(dataPath != "/") dataSubpath = dataPath + dataSubpath;
                            
                            var subresult = validators[subpath](subdata, errorHandler, dataSubpath);
                            
                            if(!subresult.valid) valid = false;
                            errors = _.flatten([errors, subresult.errors], true);
                        } else if(!additionalProperties) {
                            emitError({
                                message: "Property " + key + " not allowed" + inPart + ".",
                                property: key,
                            });
                        }
                    });
                } else {
                    emitError({
                        message: "Non-JSON value not allowed" + inPart + ".",
                    });
                }
                
                if(!_.isUndefined(localSchema.enum)) {
                    var found = _.any(localSchema.enum, function(expectedData) {
                        return equal(data, expectedData);
                    });
                    
                    if(!found) {
                        emitError({
                            message: "Value not allowed" + inPart + ".",
                            allowedValues: localSchema.enum,
                        });
                    }
                }
                
                if(!_.isUndefined(localSchema.extends)) {
                    var subpaths;
                    if(_.isArray(localSchema.extends)) {
                        subpaths = _.map(_.range(localSchema.extends.length), function(index) {
                            return "/extends/" + index;
                        });
                    } else {
                        subpaths = ["/extends"];
                    }
                    
                    _.each(subpaths, function(subpath) {
                        if(schemaPath != "/") subpath = schemaPath + subpath;
                        
                        var subschema = applyPath(schema, pathParts(subpath));
                        if(_.isString(subschema))
                            subpath = resolveLink(subschema, schemaPath);
                        
                        var subresult = validators[subpath](data, errorHandler, dataPath);
                        
                        if(!subresult.valid) valid = false;
                        errors = _.flatten([errors, subresult.errors], true);
                    });
                }
            }
            
            return {
                data: data,
                valid: valid,
                errors: errors,
            };
        };})(schemaPath, localSchema);
    }
    
    return validators["/"];
};


module.exports = directSchema;
