(function moduleExporter(moduleName, moduleBody) { // http://git.io/WebModule
   "use strict";

    var alias  = moduleName in GLOBAL ? (moduleName + "_") : moduleName; // switch
    var entity = moduleBody(GLOBAL);

    if (typeof modules !== "undefined") {
        GLOBAL["modules"]["register"](alias, moduleBody, entity["repository"]);
    }
    if (typeof exports !== "undefined") {
        module["exports"] = entity;
    }
    GLOBAL[alias] = entity;

})("PNG", function moduleBody(global) {

"use strict";

// --- dependency modules ----------------------------------
var CRC32 = global["Hash"]["CRC32"];

// --- define / local variables ----------------------------
var COLOR_TYPE_TRUE_COLOR       = 2; // RRGGBB   3bytes
var COLOR_TYPE_INDEX_COLOR      = 3; // INDEX    1byte
var COLOR_TYPE_TRUE_COLOR_ALPHA = 6; // RRGGBBAA 4bytes

var PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
var PNG_IEND      = new Uint8Array([0, 0, 0, 0, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82]);

// --- class / interfaces ----------------------------------
var PNG = {
    "parse":    PNG_parse,  // PNG.parse(source:Uint8Array, cursor:UINT32 = 0, options:Object = {}):PNGParseDataObject|null
    "decode":   PNG_decode, // PNG.decode(source:Uint8Array, data:PNGParseDataObject):PNGParseDataObject|null
    "render":   PNG_render, // PNG.render(ctx:CanvasRenderingContext2D,
                            //            frameIndex:UINT16,
                            //            frameData:APNGFrameDataObject,
                            //            frameImage:HTMLCanvasElement|HTMLImageElement,
                            //            previousFrameData:APNGFrameDataObject,
                            //            previousFrameImageData:ImageData|null):ImageData|null
    "CHECK_CRC": false      // PNG.CHECK_CRC Boolean = false - enable CRC error check.
};

// --- implements ------------------------------------------
function PNG_parse(source,    // @arg Uint8Array - PNG or APNG source data.
                   cursor,    // @arg UINT32 = 0 - source offset.
                   options) { // @arg Object = {} - { quick, posterOnly }
                              // @options.quick      Boolean = false - quick decode.
                              // @options.posterOnly Boolean = false - decode only poster frame.
                              // @ret PNGParseDataObject|null - { apng, width, height, blobs, frames, loopCount }
//{@dev
    if (!global["BENCHMARK"]) {
        $valid($type(source, "Uint8Array"),        PNG_parse, "source");
        $valid($type(cursor, "UINT32"),            PNG_parse, "cursor");
        $valid($type(options, "Object|omit"),      PNG_parse, "options");
        $valid($keys(options, "quick|posterOnly"), PNG_parse, "options");
        if (options) {
            $valid($type(options.quick,      "Boolean|omit"), PNG_parse, "options.quick");
            $valid($type(options.posterOnly, "Boolean|omit"), PNG_parse, "options.posterOnly");
        }
    }
//}@dev
    options = options || {};

    var quick = options["quick"] || 0; // Boolean - quick mode.
    var data = {
            "apng":         false,
            "width":        0,
            "height":       0,
            "bitDepth":     0,
            "colourType":   0,
            "loopCount":    0,              // acTL
            "frames":       [],             // FrameObject. [PosterFrame, AnimationFrame1, AnimationFrame2, ...]
            "blobs":        [],             // [Blob, ...]
            "PLTE":         null,           // [offset, length]
            "tRNS":         null,           // [offset, length]
        };
    var view = {
            source:         source,         // Uint8Array - source data.
            cursor:         cursor || 0,    // Integer - source cursor.
            quick:          quick,          // Boolean - quick mode.
            chunkList:      [],             // ["IHDR", ... "IEND"]
            palette:        null,           // PLTE - RRGGBBAAInteger Uint32Array([0xRRGGBBAA, ...])
            usePosterFrame: false,          // IDAT - use poster frame to first animation frame
            transparentColor: -1,           // tRNS - transparent color, 0xRRGGBB or -1
        };
    if (!view.source || !_hasPNGSignature(view)) {
        return null;
    }

    var sourceLength = view.source.length;
    var isCheckCRC = PNG["CHECK_CRC"] && !global["BENCHMARK"];

    while (view.cursor < sourceLength) {
        // --- read chunk block ---
        //
        //  | size | keyword             | value             |
        //  |------|---------------------|-------------------|
        //  | 4    | chunkDataSize       |                   |
        //  | 4    | chunkType           |                   |
        //  | ?    | chunkData           |                   |
        //  | 4    | crc                 |                   |
        var chunkDataSize = _read4(view);
        var chunkType = String.fromCharCode(view.source[view.cursor++],
                                            view.source[view.cursor++],
                                            view.source[view.cursor++],
                                            view.source[view.cursor++]);
        view.chunkList.push(chunkType);

        switch (chunkType) {
        case "IHDR": _IHDR(data, view); break;
        case "PLTE": _PLTE(data, view, chunkDataSize); break;
        case "acTL": _acTL(data, view); break;
        case "fcTL": _fcTL(data, view); break;
        case "fdAT": _fdAT(data, view, chunkDataSize); break;
        case "tRNS": _tRNS(data, view, chunkDataSize); break;
        case "IDAT": _IDAT(data, view, chunkDataSize); break;
        case "IEND": break;
        default: view.cursor += chunkDataSize; // skip unknown chunk
        }
        if (!isCheckCRC) {
            view.cursor += 4;
        } else if (!_checkSum(view, chunkDataSize, _read4(view))) {
            return null;
        }
    }

    if (options["posterOnly"]) {
        data["apng"] = false;
        data["frames"].length = 1;
    } else if (data["apng"] && !view.usePosterFrame) {
        data["frames"].unshift(); // drop poster frame.
    }
    return data;
}

function PNG_decode(source, // @arg Uint8Array - PNG or APNG source data
                    data) { // @arg PNGParseDataObject|null
                            // @ret PNGParseDataObject|null - { apng, width, height, blobs, frames, loopCount }
//{@dev
    if (!global["BENCHMARK"]) {
        $valid($type(source, "Uint8Array"),              PNG_decode, "source");
        $valid($type(data,   "PNGParseDataObject|null"), PNG_decode, "data");
    }
//}@dev

    if (data) {
        // --- create png blobs ---
        for (var i = 0, iz = data["frames"].length; i < iz; ++i) {
            var chunks = [PNG_SIGNATURE];

            _pushIHDR(chunks, source, data, i);
            if (data["PLTE"]) {
                chunks.push( source.subarray(data["PLTE"][0], data["PLTE"][1]) );
            }
            if (data["tRNS"]) {
                chunks.push( source.subarray(data["tRNS"][0], data["tRNS"][1]) );
            }
            _pushIDAT(chunks, source, data, i);
            chunks.push(PNG_IEND);

            var blobURL = URL.createObjectURL(new Blob(chunks, { "type": "image/png" }));
            data["blobs"].push(blobURL);
        }
    }
    return data;
}

function _pushIHDR(chunks, source, data, index) {
    var w = data["frames"][index]["w"];
    var h = data["frames"][index]["h"];
    var size = new Uint8Array([0, 0, 0, 13]);
    var type = new Uint8Array([0x49, 0x48, 0x44, 0x52]); // IHDR
    var body = new Uint8Array([0, 0, w >> 8, w,
                               0, 0, h >> 8, h,
                               data["bitDepth"], data["colourType"], 0, 0, 0]);
    var crc  = CRC32(body, 0, body.length, 0xA8A1AE0A); // 0xA8A1AE0A = CRC32(type, 0, 4)
    var sum  = new Uint8Array([crc >>> 24, crc >> 16, crc >> 8, crc]);
    chunks.push(size, type, body, sum);
}

function _pushIDAT(chunks, source, data, index) {
    var frame = data["frames"][index];

    for (var i = 0, iz = frame["offsets"].length; i < iz; i += 2) {
        var off  = frame["offsets"][i + 0]; // byteOffset
        var len  = frame["offsets"][i + 1]; // byteLength
        var size = new Uint8Array([len >>> 24, len >> 16, len >> 8, len]);
        var type = new Uint8Array([0x49, 0x44, 0x41, 0x54]); // IDAT
        var body = source.subarray(off, off + len);
        var crc  = CRC32(body, 0, len, 0x35AF061E); // 0x35AF061E = CRC32(type, 0, 4)
        var sum  = new Uint8Array([crc >>> 24, crc >> 16, crc >> 8, crc]);
        chunks.push(size, type, body, sum);
    }
}


function _IHDR(data, view) {
    //  | size | keyword           | value                   |
    //  |------|-------------------|-------------------------|
    //  | 4    | width             | image width             |
    //  | 4    | height            | image height            |
    //  | 1    | bitDepth          | available values are 1, 2, 4, 8 and 16 |
    //  | 1    | colourType        | available values are 0, 2, 3, 4 and 6  |
    //  | 1    | compressionMethod | available values is 0   |
    //  | 1    | filterMethod      | available values is 0   |
    //  | 1    | interraceMethod   | available values is 0 or 1 |

    data["width"]      = _read4(view);
    data["height"]     = _read4(view);
    data["bitDepth"]   = view.source[view.cursor++];
    data["colourType"] = view.source[view.cursor++];
                         view.cursor += 3; // skip compressionMethod, filterMethod, interraceMethod

    switch (data["colourType"]) {
    case COLOR_TYPE_TRUE_COLOR:
    case COLOR_TYPE_INDEX_COLOR:
    case COLOR_TYPE_TRUE_COLOR_ALPHA: break;
  //case COLOR_TYPE_GRAY_SCALE: // 0
  //case COLOR_TYPE_GRAY_SCALE_ALPHA: // 4
    default:
        throw new TypeError("unsupported colour type: " + data["colourType"]);
    }
    if (data["bitDepth"] !== 8) {
        throw new TypeError("unsupported bit depth:" + data["bitDepth"]);
    }
}

function _PLTE(data, view, chunkDataSize) {
    // has checkSumBytes
    data["PLTE"] = [view.cursor - 8, view.cursor + chunkDataSize + 4];

    if (view.quick) {
        view.cursor += chunkDataSize;
    } else {
        if (chunkDataSize % 3 !== 0) {
            throw new TypeError("palette size error: " + chunkDataSize);
        }
        view.palette = new Uint32Array(256); // PLTE - RRGGBBAAInteger [0xRRGGBBAA, ...]
        for (var i = 0, j = 0, iz = chunkDataSize; i < iz; i += 3, ++j) {
            var r = view.source[view.cursor++];
            var g = view.source[view.cursor++];
            var b = view.source[view.cursor++];
            view.palette[j] = ((r << 24) | (g << 16) | (b << 8) | 0xff) >>> 0;
        }
        for (; j < 256; ++j) {
            view.palette[j] = 0x000000ff;
        }
    }
}

function _acTL(data, view) { // Animation Control Chunk
    //
    //  | size | keyword           | value         |
    //  |------|-------------------|---------------|
    //  | 4    | numFrames         | 総フレーム数  |
    //  | 4    | numPlays          | ループ数      |
    //
    //  - acTL があれば apng
    //  - acTL はIDATの前に必要
    //  - numFrames の値は fcTL チャンクの個数と一致する
    //  - numFrames に 0 は指定できない(エラーになる), 1フレームのみの apng なら 1 を指定する
    //  - numPlays に 0 を指定すると無限ループになる
    //  - numPlays に指定された回数アニメーションをループし最後のフレームで停止する

    view.cursor += 4; // _read4(view);
    data["loopCount"] = _read4(view); // numPlays
    data["apng"] = true;
}

function _fcTL(data, view) { // Frame Control Chunk
    //
    //  | size | keyword           | value                                        |
    //  |------|-------------------|----------------------------------------------|
    //  | 4    | sequenceNumber    | アニメーションチャンクのシーケンス番号       |
    //  | 4    | width             | アニメーションフレームの幅                   |
    //  | 4    | height            | アニメーションフレームの高さ                 |
    //  | 4    | x                 | アニメーションフレームを描画するオフセットx  |
    //  | 4    | y                 | アニメーションフレームを描画するオフセットy  |
    //  | 2    | delayNum          | delay 時間の分子 |
    //  | 2    | delayDen          | delay 時間の分母 |
    //  | 1    | dispose           | 描画後の扱いを指定する |
    //  | 1    | blend             | アニメーションフレームの描画方法 |
    //
    //  - sequenceNumber は0から始まる
    //  - アニメーションフレームは矩形(x, y, w, h)で指定された領域に描画する
    //  - x, y, width, height には負の値を指定できない
    //  - アニメーションフレームの矩形は IDAT の矩形(0, 0, IDAT.width, IDAT.height) からはみ出てはならない
    //  - delayNum と delayDen でアニメーションフレームを何秒後に描画するかを指定できる
    //  - delayDen には 0 を指定可能。その場合は 100 が指定されたものとして扱う
    //      - delayDen に 0 を指定すると 10ms (1/100s) の遅延となる
    //  - delayNum には 0 を指定可能。0 を指定した場合は、次のアニメーションをできるだけ早く描画する(ベストエフォート)
    //      - 「できるだけ早く」の定義はレンダラーが自由に定義できる。「できるだけ早く = 5ms以内」と決めてしまってもよい
    //  - アニメーションの描画は、デコードタイミングとは切り離され安定していること
    //  - dispose に指定可能な値は 0(APNG_DISPOSE_OP_NONE), 1(APNG_DISPOSE_OP_BACKGROUND), 2(APNG_DISPOSE_OP_PREVIOUS)
    //      - APNG_DISPOSE_OP_NONE       は 次のフレームを描画する前に消去しない。出力バッファをそのまま使用する
    //      - APNG_DISPOSE_OP_BACKGROUND は 次のフレームを描画する前に、出力バッファのフレーム領域を「完全に透過な黒」で塗りつぶす
    //      - APNG_DISPOSE_OP_PREVIOUS   は 次のフレームを描画する前に、出力バッファのフレーム領域をこのフレームに入る前の状態に戻す
    //  - 最初の fcTL の dispose で APNG_DISPOSE_OP_PREVIOUS が指定された場合は APNG_DISPOSE_OP_BACKGROUND として扱う
    //  - blend に指定可能な値は 0(APNG_BLEND_OP_SOURCE) と 1(APNG_BLEND_OP_OVER)
    //      - APNG_BLEND_OP_SOURCE は アルファ値を含めた全ての要素をフレームの出力バッファ領域に上書きする
    //      - APNG_BLEND_OP_OVER   は 書き込むデータのアルファ値を使って出力バッファに合成する

    view.cursor += 4; // skip sequenceNumber

    var w        = _read4(view);
    var h        = _read4(view);
    var x        = _read4(view);
    var y        = _read4(view);
    var delayNum = (view.source[view.cursor++] << 8) | view.source[view.cursor++];
    var delayDen = (view.source[view.cursor++] << 8) | view.source[view.cursor++];
    var dispose  =  view.source[view.cursor++];
    var blend    =  view.source[view.cursor++];

    if (x < 0 || y < 0 || w <= 0 || h <= 0 ||
        x + w > data["width"] ||
        y + h > data["height"]) {
        throw new TypeError("invalid rect");
    }
    if (delayDen === 0) { delayDen = 100; }

    //  40    = 1000 * 4        / 100
    var delay = 1000 * delayNum / delayDen; // ms

    data["frames"].push({ "x": x, "y": y, "w": w, "h": h,
                          "dispose": dispose, "blend": blend, "delay": delay,
                          "offsets": [] });
}

function _fdAT(data, view, chunkDataSize) { // Frame Data Chunk
    //
    //  | size | keyword           | value                                        |
    //  |------|-------------------|----------------------------------------------|
    //  | 4    | sequenceNumber    | アニメーションチャンクのシーケンス番号       |
    //  | ...  | frame             | フレームデータ                               |
    //
    //  - sequenceNumber は 0から始まる
    //  - frame は IDAT と同様のフォーマット
    var index = data["frames"].length - 1;

  //_read4(view); // skip sequenceNumber
    data["frames"][index]["offsets"].push(view.cursor + 4, chunkDataSize - 4);
    view.cursor += chunkDataSize;
}

function _IDAT(data, view, chunkDataSize) {
    //
    //  | size | keyword           | value                   |
    //  |------|-------------------|-------------------------|
    //  | 1    | zlib compress     |                         |
    //  | 1    | flag and check    |                         |
    //  | ...  | compressedData    |                         |
    //  | 4    | checkSum          | ADLER32                 |
    //
    //  - ポスターフレームをアニメーションに含める場合は IDATチャンクの前に1つ fcTLチャンクを置く
    //      - fcTL が先にある場合は data.frames.length === 1 の状態 [1] でここにくる
    //      - fcTL が先にない場合は data.frames.length === 0 の状態 [2] でここにくる

    if (view.chunkList.indexOf("fcTL") > 0) { // [1]
        // IHDR ->  acTL  -> [PLTE] -> [tRNS] -> fcTL -> IDAT
        view.usePosterFrame = true;
    } else { // [2]
        // IHDR -> [acTL] -> [PLTE] -> [tRNS]         -> IDAT
        if (data["frames"].length === 0) {
            data["frames"][0] = { "x": 0, "y": 0, "w": data["width"], "h": data["height"],
                                  "dispose": 0, "blend": 0, "delay": 0.0, "offsets": [] };
        }
    }
    var index = data["frames"].length - 1;

    data["frames"][index]["offsets"].push(view.cursor, chunkDataSize);
    view.cursor += chunkDataSize;
}

function _tRNS(data, view, chunkDataSize) { // Transparency Chunk
    //
    //  COLOR_TYPE_TRUE_COLOR
    //  | size | keyword           | value                   |
    //  |------|-------------------|-------------------------|
    //  | 2    | Red sample value  |                         |
    //  | 2    | Blue sample value |                         |
    //  | 2    | Green sample value|                         |
    //
    //  COLOR_TYPE_INDEX_COLOR
    //  | size | keyword                   | value           |
    //  |------|---------------------------|-----------------|
    //  | 1    | Alpha for palette index 0 |                 |
    //  | 1    | Alpha for palette index 1 |                 |
    //  | ...  | Alpha for palette index n |                 |
    //
    //  - COLOR_TYPE_TRUE_COLOR
    //      - Red, Blue, Green sample value と一致する画素は 透明(alpah=0) として扱う
    //          - その他の画素は全て不透明として扱う
    //  - COLOR_TYPE_INDEX_COLOR の場合、パレットのエントリと一致する alpha値のデータが格納されている
    //      - 0 は透明, 255 は不透明
    //      - tRNSのデータ数とパレット数(256)は一致しない場合があり、この場合は省略されたalphaの値を255として扱う
    //      - 全てのパレットインデックスが不透明な場合は tRNS チャンクは省略可能

    // has checkSumBytes
    data["tRNS"] = [view.cursor - 8, view.cursor + chunkDataSize + 4];

    if (view.quick) {
        view.cursor += chunkDataSize;
    } else {
        switch (data["colourType"]) {
        case COLOR_TYPE_TRUE_COLOR:
            var r = (view.source[view.cursor++] << 8) | view.source[view.cursor++];
            var g = (view.source[view.cursor++] << 8) | view.source[view.cursor++];
            var b = (view.source[view.cursor++] << 8) | view.source[view.cursor++];

            view.transparentColor = (r << 16) | (g << 8) | b;
            break;
        case COLOR_TYPE_INDEX_COLOR:
            if (view.palette) {
                for (var i = 0, iz = chunkDataSize; i < iz; ++i) {
                    var alpha = view.source[view.cursor++]; // alpha value. (0x00 - 0xff)

                    view.palette[i] = (view.palette[i] & 0xffffff00) | alpha;
                }
            }
        }
    }
}

function _read4(view) { // @ret UINT32
    return ((view.source[view.cursor++]  << 24) |
            (view.source[view.cursor++]  << 16) |
            (view.source[view.cursor++]  <<  8) |
             view.source[view.cursor++]) >>> 0;
}
function _checkSum(view, chunkDataSize, sum) {
    // +------+------+------+-----+
    // | size | type | data | crc |
    // |  (4) |  (4) |  (?) | (4) |
    // +------+------+------+-----+
    //                            ^
    //                            |
    //                            view.cursor
    var offset = view.cursor - chunkDataSize - 4 - 4;
    var length = 4 + chunkDataSize; // type(4) + data(?)
    var crc    = CRC32(view.source, offset, length);

    return crc === sum;
}

function _hasPNGSignature(view) {
    for (var i = 0, iz = PNG_SIGNATURE.length; i < iz; ++i) {
        if ( view.source[view.cursor++] !== PNG_SIGNATURE[i] ) {
            return false;
        }
    }
    return true;
}

function PNG_render(ctx,                      // @arg CanvasRenderingContext2D
                    frameIndex,               // @arg UINT16 - current apng frame index.
                    frameData,                // @arg APNGFrameDataObject - current frame data. { x, y, w, h, blend, dispose }
                    frameImage,               // @arg HTMLCanvasElement|HTMLImageElement - current frame image resource(fragment image)
                    previousFrameData,        // @arg APNGFrameDataObject - previous frame data. { x, y, w, h, dispose }
                    previousFrameImageData) { // @arg ImageData|null - previous canvas pixel data.
                                              // @ret ImageData|null - previous canvas pixel data.
    var result = null;
    var fx = frameData["x"];
    var fy = frameData["y"];
    var fw = frameData["w"];
    var fh = frameData["h"];

    // --- dispose operation ---------------------------
    if (frameIndex === 0) { // is first frame
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    } else {
        var pf = previousFrameData;

        if (pf["dispose"] === 1) { // APNG_DISPOSE_OP_BACKGROUND
            ctx.clearRect(pf["x"], pf["y"], pf["w"], pf["h"]);
        } else if (pf["dispose"] === 2) { // APNG_DISPOSE_OP_PREVIOUS
            ctx.putImageData(previousFrameImageData, pf["x"], pf["y"]);
        }
    }

    if (frameData["dispose"] === 2) {
        result = ctx.getImageData(fx, fy, fw, fh);
    }
    // --- blend operation -----------------------------
    if (frameData["blend"] === 0) {
        ctx.clearRect(fx, fy, fw, fh);
    }
    ctx.drawImage(frameImage, fx, fy, fw, fh);

    return result;
}

// --- validate and assert functions -----------------------
//{@dev
  function $type(obj, type)      { return GLOBAL["Valid"] ? GLOBAL["Valid"].type(obj, type)    : true; }
  function $keys(obj, str)       { return GLOBAL["Valid"] ? GLOBAL["Valid"].keys(obj, str)     : true; }
//function $some(val, str, ig)   { return GLOBAL["Valid"] ? GLOBAL["Valid"].some(val, str, ig) : true; }
//function $args(fn, args)       { if (GLOBAL["Valid"]) { GLOBAL["Valid"].args(fn, args); } }
  function $valid(val, fn, hint) { if (GLOBAL["Valid"]) { GLOBAL["Valid"](val, fn, hint); } }
//}@dev

return PNG; // return entity

});

