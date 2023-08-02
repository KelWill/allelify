#!/usr/bin/env node

const allelify = require("./index");
allelify([].slice.call(process.argv, 2));
