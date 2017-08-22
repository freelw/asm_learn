'use strict'

const fs = require('fs');
const mkdirp = require('mkdirp');
const block_size = 1024;

function pair(a, b) {
    return {a, b};
}

function FsMinixWriter(dir) {

    this.initSuperBlock();
    this.initBuffer();
}

FsMinixWriter.prototype.initSuperBlock = function() {

    this.super_block_meta = [
        pair('s_ninodes', 'short'),
        pair('s_nzones', 'short'),
        pair('s_imap_blocks', 'short'),
        pair('s_zmap_blocks', 'short'),
        pair('s_firstdatazone', 'short'),
        pair('s_log_zone_size', 'short'),
        pair('s_max_size', 'long'),
        pair('s_magic', 'short')
    ];

    this.super_block = {
        s_ninodes : 480,
        s_nzones : 1440,
        s_imap_blocks : 1,
        s_zmap_blocks : 1,
        s_firstdatazone : 19,
        s_log_zone_size : 0,
        s_max_size : 268966912,
        s_magic : 4991
    }

    let offset = block_size;
    this.super_block_meta.forEach((p) => {
        if ('short' == p.b) {
            this.buffer.writeInt16LE(this.super_block[p.a], offset);
            offset += 2;
        } else if ('long' == p.b) {
            this.buffer.writeInt32LE(this.super_block[p.a], offset);
            offset += 4;
        }
    });


}

FsMinixWriter.prototype.initBuffer = function() {
    this.buffer = new Buffer(this.super_block.s_nzones * block_size);
}

FsMinixWriter.prototype.getBuffer = function() {
    return new Buffer(0);
}

module.exports = FsMinixWriter;