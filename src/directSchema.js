var _ = require('underscore');


var pathParts = function(path) {
    if(path == "/") return [];
    return _.map(path.split("/").slice(1), function(component) {
        var result = "";
        for(var i = 0; i < component.length; i++) {
            if(component[i] == '~') {
                if(i + 1 < component.length) {
                    if(component[i + 1] == "0") {
                        result += "~";
                    } else if(component[i + 1] == "1") {
                        result += "/";
                    }
                    i += 1;
                }
            } else if(component[i] == "%") {
                if(i + 2 < component.length) {
                    result += String.fromCharCode
                        (parseInt(component.slice(i + 1, i + 3), 16));
                    i += 2;
                }
            } else {
                result += component[i];
            }
        }
        
        return result;
    });
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
        if(errorHandler) errorHandler(error);
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
        var allowedSchemas = _.filter(_.map(allowedTypes, function(allowedType, index) {
            return [index, allowedType];
        }), function(allowedType) {
            return !_.isString(allowedType[1]);
        });
        allowedTypes = _.filter(allowedTypes, _.isString);
        if(_.contains(allowedTypes, "any"))
            allowedTypes = ["string", "number", "integer", "boolean",
                            "object", "array", "null"];
        
        var errorGroups = [];
        
        _.each(allowedSchemas, function(allowedSchema) {
            var subpath = "/type/" + allowedSchema[0];
            if(schemaPath != "/") subpath = schemaPath + subpath;
            
            var subresult = validate({
                data: data,
                schema: allowedSchema[1],
                topSchema: topSchema,
                schemaPath: subpath,
                dataPath: dataPath,
                errorHandler: null,
            });
            
            errorGroups.push([subresult.valid, subresult.errors]);
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
        } else {
            emitError({
                message: "Non-JSON value not allowed" + inPart + ".",
            });
        }
        
        errorGroups.push([errorGroup.length == 0, errorGroup]);
        emitError = savedEmitError;
        var successCount = _.filter(errorGroups, function(errorGroup) {
            return errorGroup[0];
        }).length;
        var failures = _.map(_.filter(errorGroups, function(errorGroup) {
            return !errorGroup[0];
        }), function(errorGroup) {
            return errorGroup[1];
        });
        if(successCount == 0) {
            emitError({
                message: "No interpretation matches" + inPart +".",
                interpretations: failures,
            });
        }
        
        if(_.isNull(data)) {
        } else if(_.isBoolean(data)) {
        } else if(_.isNumber(data)) {
            if(!_.isUndefined(schema.minimum)) {
                if(!_.isUndefined(schema.exclusiveMinimum) && schema.exclusiveMinimum) {
                    if(data <= schema.minimum) {
                        emitError({
                            message: "Number doesn't meet exclusive minimum" + inPart + ".",
                            minimum: schema.minimum,
                        });
                    }
                } else {
                    if(data <= schema.minimum) {
                        emitError({
                            message: "Number doesn't meet minimum" + inPart + ".",
                            minimum: schema.minimum,
                        });
                    }
                }
            }
            
            if(!_.isUndefined(schema.maximum)) {
                if(!_.isUndefined(schema.exclusiveMaximum) && schema.exclusiveMaximum) {
                    if(data >= schema.maximum) {
                        emitError({
                            message: "Number exceeds exclusive maximum" + inPart + ".",
                            maximum: schema.maximum,
                        });
                    }
                } else {
                    if(data > schema.maximum) {
                        emitError({
                            message: "Number exceeds maximum" + inPart + ".",
                            maximum: schema.maximum,
                        });
                    }
                }
            }
            
            if(!_.isUndefined(schema.divisibleBy)) {
                if(data % schema.divisibleBy != 0) {
                    emitError({
                        message: "Number not divisible by " + schema.divisibleBy + inPart + ".",
                        divisor: schema.divisibleBy,
                    });
                }
            }
        } else if(_.isString(data)) {
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
        } else if(_.isArray(data)) {
            if(_.isArray(schema.items)) {
                for(var index = 0; index < data.length && index < schema.items.length; index++) {
                    var subpath = "/items/" + index;
                    if(schemaPath != "/") subpath = schemaPath + subpath;
                    
                    var subschema = schema.items[index];
                    
                    dataSubpath = "/" + index;
                    if(dataPath != "/") dataSubpath = dataPath + dataSubpath;
                    
                    var subdata = data[index];
                    
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
                }
                
                if(data.length < schema.items.length) {
                    emitError({
                        message: "Array doesn't meet tuple length" + inPart + ".",
                        actualLength: data.length,
                        tupleLength: schema.items.length,
                    });
                } else if(data.length > schema.items.length) {
                    if(!_.isUndefined(schema.additionalItems)) {
                        if(_.isBoolean(schema.additionalItems)) {
                            if(!schema.additionalItems) {
                                emitError({
                                    message: "Array exceeds tuple length" + inPart + ".",
                                    actualLength: data.length,
                                    tupleLength: schema.items.length,
                                });
                            }
                        } else if(_.isObject(schema.additionalItems)) {
                            var subpath = "/additionalItems";
                            if(schemaPath != "/") subpath = schemaPath + subpath;
                            
                            var subschema = schema.additionalItems;
                            
                            for(var index = schema.items.length; index < data.length; index++) {
                                dataSubpath = "/" + index;
                                if(dataPath != "/") dataSubpath = dataPath + dataSubpath;
                                
                                var subdata = data[index];
                                
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
                            }
                        }
                    }
                }
            } else if(_.isObject(schema.items)) {
                var subpath = "/items";
                if(schemaPath != "/") subpath = schemaPath + subpath;
                
                var subschema = schema.items;
                
                _.each(data, function(subdata, index) {
                    dataSubpath = "/" + index;
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
                });
            }
            
            if(!_.isUndefined(schema.minItems)) {
                if(data.length < schema.minItems) {
                    emitError({
                        message: "Array doesn't meet minimum length" + inPart + ".",
                        actualLength: data.length,
                        minimumLength: schema.minItems,
                    });
                }
            }
            
            if(!_.isUndefined(schema.maxItems)) {
                if(data.length > schema.maxItems) {
                    emitError({
                        message: "Array exceeds maximum length" + inPart + ".",
                        actualLength: data.length,
                        maximumLength: schema.maxItems,
                    });
                }
            }
            
            if(!_.isUndefined(schema.uniqueItems) && schema.uniqueItems) {
                var uniques = [];
                var duplicates = [];
                _.each(data, function(subdata) {
                    var found = false;
                    _.each(uniques, function(unique) {
                        if(equal(unique, subdata)) {
                            found = true;
                            duplicates.push(subdata);
                        }
                    });
                    if(!found) uniques.push(subdata);
                });
                
                if(duplicates.length > 0) {
                    emitError({
                        message: "Array contains duplicate items" + inPart + ".",
                        duplicates: duplicates,
                    });
                }
            }
        } else if(_.isObject(data)) {
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
            
            if(!_.isUndefined(schema.properties)) {
                _.each(schema.properties, function(subschema, key) {
                    if(!_.isUndefined(subschema.required) && subschema.required
                       && _.isUndefined(data[key]))
                    {
                        emitError({
                        message: "Property " + key + " required" + inPart + ".",
                        property: key,
                        });
                    }
                });
            }
        }
        
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
