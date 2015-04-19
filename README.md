# PNG.js [![Build Status](https://travis-ci.org/uupaa/PNG.js.png)](http://travis-ci.org/uupaa/PNG.js)

[![npm](https://nodei.co/npm/uupaa.png.js.png?downloads=true&stars=true)](https://nodei.co/npm/uupaa.png.js/)

PNG and APNG implementation.

## Document

- [PNG.js wiki](https://github.com/uupaa/PNG.js/wiki/PNG)
- [WebModule](https://github.com/uupaa/WebModule)
    - [Slide](http://uupaa.github.io/Slide/slide/WebModule/index.html)
    - [Development](https://github.com/uupaa/WebModule/wiki/Development)

## Run on

### Browser and node-webkit

```js
<script src="lib/PNG.js"></script>
<script>

var pngBinary = new Uint8Array(...);
var pngData = PNG.decode(source, PNG.parse(pngBinary));

pngRender(pngData);
</script>
```

### WebWorkers

```js
importScripts("lib/PNG.js");

var pngBinary = new Uint8Array(...);
var pngData = PNG.decode(source, PNG.parse(pngBinary));

postMessage(pngData, ...);
```

### Node.js

```js
require("lib/PNG.js");

var pngBinary = new Uint8Array(...);
var pngData = PNG.decode(source, PNG.parse(pngBinary));
```

