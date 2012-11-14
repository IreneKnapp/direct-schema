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

var validate;
validate = function(options) {
    var data = options.data;
    var schema = options.schema;
    var topSchema = options.topSchema;
    var schemaPath = options.schemaPath;
    var dataPath = options.dataPath;
    var errorHandler = options.errorHandler;
    
    var valid = true;
    var errors = [];
    var inPart = _.isString(schema.title) ? " in " + schema.title : "";
    var errorTemplate = {
        dataPath: dataPath,
        schemaPath: schemaPath,
        schemaTitle: schema.title,
        schemaDescription: schema.description,
        data: data,
        schema: schema,
    };
    
    var emitError = function(options) {
        var error = _.extend(options, errorTemplate);
        valid = false;
        errors.push(error);
        if(!_.isNull(errorHandler)) errorHandler(error);
    };
    
    if(!_.isUndefined(schema.$ref)) {
        var subpath = resolveLink(schema.$ref, schemaPath);
        
        if(!_.isNull(subpath)) {
            var subschema = applyPath(topSchema, pathParts(subpath));
            
            var subresult = validate({
                data: data,
                schema: subschema,
                topSchema: topSchema,
                schemaPath: subpath,
                dataPath: dataPath,
                errorHandler: errorHandler,
            });
            
            if(!subresult.valid) valid = false;
            errors = _.flatten([errors, subresult.errors], true);
        } else {
            emitError({
                message: "Referenced schema with URL " + schema.$ref + " not found.",
                reference: schema.$ref,
            });
        }
    } else {
        var allowedTypes = schema.type || "any";
        if(_.isString(allowedTypes)) allowedTypes = [allowedTypes];
        var allowedSchemas = _.reject(allowedTypes, _.isString);
        allowedTypes = _.filter(allowedTypes, _.isString);
        if(_.contains(allowedTypes, "any"))
            allowedTypes = ["string", "number", "integer", "boolean",
                            "object", "array", "null"];
        
        var errorGroups = [];
        
        _.each(allowedSchemas, function(allowedSchema) {
            // ... IAK
        });
        
        var errorGroup = [];
        var savedEmitError = emitError;
        emitError = function(options) {
            var error = _.extend(options, errorTemplate);
            errorGroup.push(error);
        }
        
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
                if(!_.isUndefined(schema.pattern)) {
                    var regexp = new RegExp(schema.pattern);
                    if(!regexp.test(data)) {
                        emitError({
                            message: "String doesn't match pattern" + inPart + ".",
                            pattern: schema.pattern,
                        });
                    }
                }
                
                if(!_.isUndefined(schema.minLength)) {
                    if(data.length < schema.minLength) {
                        emitError({
                            message: "String doesn't meet minimum length" + inPart + ".",
                            actualLength: data.length,
                            minimumLength: schema.minLength,
                        });
                    }
                }
                
                if(!_.isUndefined(schema.maxLength)) {
                    if(data.length > schema.maxLength) {
                        emitError({
                            message: "String exceeds maximum length" + inPart + ".",
                            actualLength: data.length,
                            maximumLength: schema.maxLength,
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
                
                if(!_.isUndefined(schema.properties)
                   && !_.isUndefined(schema.properties[key]))
                {
                    subpath = "/properties/" + key;
                }
                
                if(_.isNull(subpath) && !_.isUndefined(schema.patternProperties)) {
                    _.each(_.keys(schema.patternProperties), function(pattern) {
                        if(!_.isNull(subpath)) return;
                        
                        if(key.match(pattern)) {
                            subpath = "/patternProperties/" + pattern;
                        }
                    });
                }
                
                if(_.isNull(subpath) && !_.isUndefined(schema.additionalProperties)) {
                    if(_.isBoolean(schema.additionalProperties)) {
                        additionalProperties = schema.additionalProperties;
                    } else {
                        subpath = "/additionalProperties";
                    }
                }
                
                if(!_.isNull(subpath)) {
                    if(schemaPath != "/") subpath = schemaPath + subpath;
                   
                    var subschema = applyPath(topSchema, pathParts(subpath));
                    
                    dataSubpath = "/" + key;
                    if(dataPath != "/") dataSubpath = dataPath + dataSubpath;
                    
                    var subresult = validate({
                        data: subdata,
                        schema: subschema,
                        topSchema: topSchema,
                        schemaPath: subpath,
                        dataPath: dataSubpath,
                        errorHandler: errorHandler,
                    });
                    
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
        
        errorGroups.push(errorGroup);
        emitError = savedEmitError;
        // IAK
        
        if(!_.isUndefined(schema.enum)) {
            var found = _.any(schema.enum, function(expectedData) {
                return equal(data, expectedData);
            });
            
            if(!found) {
                emitError({
                    message: "Value not allowed" + inPart + ".",
                    allowedValues: schema.enum,
                });
            }
        }
        
        if(!_.isUndefined(schema.extends)) {
            var subpaths;
            if(_.isArray(schema.extends)) {
                subpaths = _.map(_.range(schema.extends.length), function(index) {
                    return "/extends/" + index;
                });
            } else {
                subpaths = ["/extends"];
            }
            
            _.each(subpaths, function(subpath) {
                if(schemaPath != "/") subpath = schemaPath + subpath;
                
                var subschema = applyPath(topSchema, pathParts(subpath));
                
                var subresult = validate({
                    data: data,
                    schema: subschema,
                    topSchema: topSchema,
                    schemaPath: subpath,
                    dataPath: dataPath,
                    errorHandler: errorHandler,
                });
                
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
}

var directSchema = function(schema) {
    return function(data, errorHandler) {
        return validate({
            data: data,
            schema: schema,
            topSchema: schema,
            schemaPath: "/",
            dataPath: "/",
            errorHandler: errorHandler,
        });
    };
}

module.exports = directSchema;
