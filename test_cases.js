const allelify = require("./index");
const path = require("path");

allelify([
    { command: "make lint", title: "test" },
    { command: "sleep 2", title: "lint" },
    { command: "sleep 1", title: "test types" },
    {
        title: "snarglify",
        command: "ag",
        args: ["-l", "build steps"],
    },
    "sleep 1",
], { tmpDirectory: path.join(__dirname, "./tmp") });
