var fs = require("fs");
var directSchema = require("direct-schema");


var schema = JSON.parse(fs.readFileSync('tests/test-schema.json', "utf8"));
var data = JSON.parse(fs.readFileSync('tests/test-data.json', "utf8"));
var validator = directSchema(schema);
var result = validator(data, function(error) {
    console.log(error);
});
console.log("Okay!");
