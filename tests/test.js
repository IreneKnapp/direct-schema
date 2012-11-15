var fs = require("fs");
var _ = require("underscore");
var directSchema = require("../src/directSchema.js");

var directory = "tests/JSON-Schema-Test-Suite/tests/draft3";
var filenames = _.map(_.filter(fs.readdirSync(directory), function(filename) {
    return /.json$/.test(filename);
}), function(filename) {
    return directory + "/" + filename;
});

var passes = 0;
var failures = 0;
_.each(filenames, function(filename) {
    console.log(filename);
    var file = JSON.parse(fs.readFileSync(filename, "utf8"));
    _.each(file, function(suite) {
        console.log("  " + suite.description);
        var schema = suite.schema;
        var validator = directSchema(schema);
        _.each(suite.tests, function(test) {
            console.log("    " + test.description);
            var data = test.data;
            var expectedResult = test.valid;
            var actualResult = validator(data).valid;
            if(expectedResult == actualResult) {
                passes++;
                console.log("      pass");
            } else {
                failures++;
                console.log("      FAIL");
            }
        });
    });
});

console.log("Okay!  " + passes + " passes and " + failures + " failures.");
