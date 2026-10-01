global.fetch = () => {throw new Error('Network disabled by frontend tests');};
for (const name of ['http','https']) {const m = require(name); m.request = () => {throw new Error('Network disabled by frontend tests');}; m.get=m.request;}
