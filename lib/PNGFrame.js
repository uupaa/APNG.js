//{@pngframe
(function(global) {
"use strict";

// --- dependency modules ----------------------------------
var ZLib = global["ZLib"];

// --- define / local variables ----------------------------
//var _isNodeOrNodeWebKit = !!global.global;
//var _runOnNodeWebKit =  _isNodeOrNodeWebKit &&  /native/.test(setTimeout);
//var _runOnNode       =  _isNodeOrNodeWebKit && !/native/.test(setTimeout);
//var _runOnWorker     = !_isNodeOrNodeWebKit && "WorkerLocation" in global;
//var _runOnBrowser    = !_isNodeOrNodeWebKit && "document" in global;

var COLOR_TYPE_TO_UNIT = [0, 0, 3, 1, 0, 0, 4];
                       //                   ~  COLOR_TYPE_RRGGBBAA(2) 4bytes
                       //          ~           COLOR_TYPE_INDEX(3)    1byte
                       //       ~              COLOR_TYPE_RRGGBB(6)   3bytes
var FILTER_METHOD_NONE    = 0;
var FILTER_METHOD_SUB     = 1;
var FILTER_METHOD_UP      = 2;
var FILTER_METHOD_AVERAGE = 3;
var FILTER_METHOD_PAETH   = 4;

// --- class / interfaces ----------------------------------
function PNGFrame(colourType, // @arg Integer = 0   - COLOR_TYPE_xxx. 2 or 3 or 6
                  x,          // @arg Integer = 0   - offset x
                  y,          // @arg Integer = 0   - offset y
                  w,          // @arg Integer = 0   - frame height
                  h,          // @arg Integer = 0   - frame width
                  dispose,    // @arg Integer = 0   - dispose
                  blend) {    // @arg Integer = 0   - blend
//{@dev
    if (!global["BENCHMARK"]) {
        $valid($type(colourType, "Integer|omit"), PNGFrame, "colourType");
        $valid($type(x,          "Integer|omit"), PNGFrame, "x");
        $valid($type(y,          "Integer|omit"), PNGFrame, "y");
        $valid($type(w,          "Integer|omit"), PNGFrame, "w");
        $valid($type(h,          "Integer|omit"), PNGFrame, "h");
        $valid($type(dispose,    "Integer|omit"), PNGFrame, "dispose");
        $valid($type(blend,      "Integer|omit"), PNGFrame, "blend");
    }
//}@dev

    this._colourType = colourType || 0;
    // ---------------------
    this._x          = x || 0;
    this._y          = y || 0;
    this._w          = w || 0;
    this._h          = h || 0;
    this._dispose    = dispose || 0;
    this._blend      = blend   || 0;
    this._pixels     = null;
    // ----------------------
    this._zlib       = []; // zlib buffer
    this._zlibSize   = 0;
}

PNGFrame["COLOR_BAR"] = false;         // color bar mode
PNGFrame["prototype"] = {
    "constructor":  PNGFrame,          // new PNGFrame(...):PNGFrame
    "toJSON":       PNGFrame_toJSON,   // PNGFrame#toJSON():Object
    "add":          PNGFrame_add,      // PNGFrame#add(zlib:Uint8Array):void
    "decode":       PNGFrame_decode,   // PNGFrame#decode(palette:Uint32Array, tRNS:RRGGBBInteger, gamma:Number):void
};

// --- implements ------------------------------------------
function PNGFrame_toJSON() { // @ret Object
    return {
        "x":       this._x,       // Integer
        "y":       this._y,       // Integer
        "w":       this._w,       // Integer
        "h":       this._h,       // Integer
        "blend":   this._blend,   // Integer
        "dispose": this._dispose, // Integer
        "pixels":  this._pixels   // Uint8Array - pixels
    };
}

function PNGFrame_add(zlib) { // @arg Uint8Array - zlib data
//{@dev
    if (!global["BENCHMARK"]) {
        $valid($type(zlib, "Uint8Array"), PNGFrame_add, "zlib");
    }
//}@dev

    this._zlib.push(zlib);
    this._zlibSize += zlib.length;
}

function PNGFrame_decode(palette, // @arg Uint32Array - [0xRRGGBBAA, ...]
                         tRNS,    // @arg RRGGBBInteger - transparent color, 0xRRGGBB or -1
                         gamma) { // @arg Number - gamma value, eg:0.45... or 1
    var zlibBuffer = null;
    var offset = 0, i = 0, iz = this._zlib.length;

    switch (iz) {
    case 0: this._pixels = new Uint8Array(0); return;       // no frame
    case 1: zlibBuffer = this._zlib[0]; break;              // single frame (png)
    default:zlibBuffer = new Uint8Array(this._zlibSize);    // multi frame. (APNG)
            for (; i < iz; ++i) {
                zlibBuffer.set(this._zlib[i], offset);
                offset += this._zlib[i].length;
            }
    }
    var unzlibBuffer = ZLib["inflate"](zlibBuffer, {}); // { "verify": true }

    // http://www.w3.org/TR/PNG/#9Filter-types
    this._pixels = new Uint8Array(this._w * this._h * 4); // [<R,G,B,A>, ...]

    _rawDecode(unzlibBuffer, this._pixels, this._w, this._h,
               COLOR_TYPE_TO_UNIT[this._colourType], palette, tRNS, gamma);

    // --- release zlib buffer ---
    this._zlib = null;
    this._zlibSize = 0;
}

function _rawDecode(filt, recon, w, h, unitSize, palette, tRNS, gamma) {
    var fc = 0; // filt cursor
    var rc = 0; // recon cursor
    var rb = new Uint8Array(12);          // reconstruction buffer. [<a0,a1,a2,a3>, <b0,b1,b2,b3>, <c0,c1,c2,c3>]
    var flitLineBytes = 1 + unitSize * w; // lineByts. RRGGBBAA = [FILTER, <R,G,B,A>, ...]
                                          //            RRGGBB  = [FILTER, <R,G,B>, ...]
                                          //            INDEX   = [FILTER, <INDEX>, ...]
    var reconLineBytes = 4 * w;           // lineByts. RRGGBBAA = [<R,G,B,A>, ...]
    var useGamma = gamma !== 1.0;
// FIXME:
    useGamma = false;

    var colorBar = PNGFrame["COLOR_BAR"] || false;

    for (var y = 0; y < h; ++y) {
        var filterMethod = filt[fc++]; // x = 0 is filter method

        for (var x = 1; x < flitLineBytes; x += unitSize) {
            var r = 0, g = 0, b = 0, a = 0;

            if (unitSize === 1) { // INDEX COLOR
                a = palette[ filt[fc++] ]; // Palette Index
                r = (a >>> 24) & 0xff;
                g = (a >>> 16) & 0xff;
                b = (a >>>  8) & 0xff;
                a =  a         & 0xff;
            } else {
                r = filt[fc++];
                g = filt[fc++];
                b = filt[fc++];
                a = (unitSize === 4) ? filt[fc++] : 255; // RRGGBBAA or RRGGBB
            }
            switch (filterMethod) {
            case FILTER_METHOD_SUB:
                rb.set([0, 0, 0, 0], 0);
                if (x > unitSize) { // left
                    rb[0] = recon[rc - 4];
                    rb[1] = recon[rc - 3];
                    rb[2] = recon[rc - 2];
                    rb[3] = recon[rc - 1];
                }
                r += rb[0];
                g += rb[1];
                b += rb[2];
                a += rb[3];
                break;
            case FILTER_METHOD_UP:
                rb.set([0, 0, 0, 0], 4);
                if (y) { // up
                    rb[4] = recon[rc - reconLineBytes + 0];
                    rb[5] = recon[rc - reconLineBytes + 1];
                    rb[6] = recon[rc - reconLineBytes + 2];
                    rb[7] = recon[rc - reconLineBytes + 3];
                }
                r += rb[4];
                g += rb[5];
                b += rb[6];
                a += rb[7];
                break;
            case FILTER_METHOD_AVERAGE:
                rb.set([0, 0, 0, 0,
                        0, 0, 0, 0], 0);
                if (x > unitSize) { // left
                    rb[0] = recon[rc - 4];
                    rb[1] = recon[rc - 3];
                    rb[2] = recon[rc - 2];
                    rb[3] = recon[rc - 1];
                }
                if (y) { // up
                    rb[4] = recon[rc - reconLineBytes + 0];
                    rb[5] = recon[rc - reconLineBytes + 1];
                    rb[6] = recon[rc - reconLineBytes + 2];
                    rb[7] = recon[rc - reconLineBytes + 3];
                }
                r += Math.floor((rb[0] + rb[4]) / 2);
                g += Math.floor((rb[1] + rb[5]) / 2);
                b += Math.floor((rb[2] + rb[6]) / 2);
                a += Math.floor((rb[3] + rb[7]) / 2);
                break;
            case FILTER_METHOD_PAETH:
                rb.set([0, 0, 0, 0,
                        0, 0, 0, 0,
                        0, 0, 0, 0], 0);
                if (x > unitSize) { // left
                    rb[0] = recon[rc - 4];
                    rb[1] = recon[rc - 3];
                    rb[2] = recon[rc - 2];
                    rb[3] = recon[rc - 1];
                }
                if (y) { // up
                    rb[4] = recon[rc - reconLineBytes + 0];
                    rb[5] = recon[rc - reconLineBytes + 1];
                    rb[6] = recon[rc - reconLineBytes + 2];
                    rb[7] = recon[rc - reconLineBytes + 3];
                }
                if (x > unitSize && y) { // up left
                    rb[8]  = recon[rc - reconLineBytes - 4];
                    rb[9]  = recon[rc - reconLineBytes - 3];
                    rb[10] = recon[rc - reconLineBytes - 2];
                    rb[11] = recon[rc - reconLineBytes - 1];
                }
                r += _paethPredictor(rb[0], rb[4], rb[8]);
                g += _paethPredictor(rb[1], rb[5], rb[9]);
                b += _paethPredictor(rb[2], rb[6], rb[10]);
                a += _paethPredictor(rb[3], rb[7], rb[11]);
            }

            if (unitSize === 3) { // RRGGBB
                a = (tRNS >= 0 && tRNS === ((r << 16) | (g << 8) | b)) ? 0 : 255;
            }
//{@debug
            if (colorBar) {
                r = 0; g = 0; b = 0; a = 255;
                switch (filterMethod) {
                case FILTER_METHOD_NONE:    r = g = 255;     break; // yellow
                case FILTER_METHOD_SUB:     r = b = 255;     break; // purple
                case FILTER_METHOD_UP:      r = g = b = 255; break; // white
                case FILTER_METHOD_AVERAGE: g = 255;         break; // green
                case FILTER_METHOD_PAETH:   b = 255;                // blue
                }
            }
//}@debug

// FIXME:
            if (useGamma) {
                r = (255 * Math.pow(r / 255, gamma)) & 0xff;
                g = (255 * Math.pow(g / 255, gamma)) & 0xff;
                b = (255 * Math.pow(b / 255, gamma)) & 0xff;
            }
            //recon.set([r, g, b, a], rc);
            //rc += 4;
            recon[rc++] = r;
            recon[rc++] = g;
            recon[rc++] = b;
            recon[rc++] = a;
        }
    }
}

function _paethPredictor(a, b, c) {
    //  +-+-+
    //  |c|b|
    //  +-+-+
    //  |a|x|
    //  +-+-+

    var p = a + b - c;
    var pa = Math.abs(p - a);
    var pb = Math.abs(p - b);
    var pc = Math.abs(p - c);

    return (pa <= pb && pa <= pc) ? a
         : (pb <= pc) ? b
                      : c;
}

// --- validate / assertions -------------------------------
//{@dev
function $valid(val, fn, hint) { if (global["Valid"]) { global["Valid"](val, fn, hint); } }
function $type(obj, type) { return global["Valid"] ? global["Valid"].type(obj, type) : true; }
//function $keys(obj, str) { return global["Valid"] ? global["Valid"].keys(obj, str) : true; }
//function $some(val, str, ignore) { return global["Valid"] ? global["Valid"].some(val, str, ignore) : true; }
//function $args(fn, args) { if (global["Valid"]) { global["Valid"].args(fn, args); } }
//}@dev

// --- exports ---------------------------------------------
if (typeof module !== "undefined") {
    module["exports"] = PNGFrame;
}
global["PNGFrame" in global ? "PNGFrame_" : "PNGFrame"] = PNGFrame;

})((this || 0).self || global); // WebModule idiom. http://git.io/WebModule
//}@pngframe

