# PNG.js [![Build Status](https://travis-ci.org/uupaa/PNG.js.svg)](https://travis-ci.org/uupaa/PNG.js)

[![npm](https://nodei.co/npm/uupaa.png.js.svg?downloads=true&stars=true)](https://nodei.co/npm/uupaa.png.js/)

PNG and APNG implementation.

## Document

- PNG.js made of [WebModule](https://github.com/uupaa/WebModule).
- [Spec](https://github.com/uupaa/PNG.js/wiki/PNG)

## Browser and NW.js(node-webkit)

```js
<script src="<module-dir>/lib/WebModule.js"></script>
<script src="<module-dir>/lib/PNG.js"></script>
<script>

var pngBinary = new Uint8Array(...);
var pngData = WebModule.PNG.decode(source, WebModule.PNG.parse(pngBinary));

pngRender(pngData);
</script>
```

## WebWorkers

```js
importScripts("<module-dir>lib/WebModule.js");
importScripts("<module-dir>lib/PNG.js");

var pngBinary = new Uint8Array(...);
var pngData = WebModule.PNG.decode(source, WebModule.PNG.parse(pngBinary));

postMessage(pngData, ...);
```

## Node.js

```js
require("<module-dir>lib/WebModule.js");
require("<module-dir>lib/PNG.js");

var pngBinary = new Uint8Array(...);
var pngData = WebModule.PNG.decode(source, WebModule.PNG.parse(pngBinary));
```

