'use strict'

const fs = require('fs');
const program = require('commander');
const block_size = 1024;

function pair(a, b) {
    return {a, b};
}

function FsMinix(buffer) {
    this.buffer = buffer;
    this.origin_buffer = new Buffer(buffer);
    this.readBootBlock();
    this.readSuperBlock();
    this.readInodeBitMap();
    this.readLogicBitMap();
}

FsMinix.prototype.readBootBlock = function() {
    this.buffer = this.buffer.slice(block_size);
}

FsMinix.prototype.readSuperBlock = function() {
    let block_left = block_size;
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
    this.super_block = {};
    this.super_block_meta.forEach((p) => {
        let v = null;
        if ('short' == p.b) {
            v = this.buffer.readInt16LE();
            this.buffer = this.buffer.slice(2);
            block_left -= 2;
        } else if ('long' == p.b) {
            v = this.buffer.readInt32LE();
            this.buffer = this.buffer.slice(4);
            block_left -= 4;
        }
        if (!(null === v)) {
            this.super_block[p.a] = v;
        } else {
            console.error('[warning] can\'t get v by key : ', p.a);
        }
    });
    console.log('block_left : ', block_left);
    this.buffer = this.buffer.slice(block_left);
}

FsMinix.prototype.readInodeBitMap = function() {
    this.inode_bitmap = this.buffer.slice(0, block_size);
    this.buffer = this.buffer.slice(block_size);
}

FsMinix.prototype.getInodeStatus = function(index) {
    const base = parseInt(index/8);
    const offset = index % 8;
    return !!((this.inode_bitmap.slice(base, base+1).readUInt8()) & (1 << offset));
}

FsMinix.prototype.readLogicBitMap = function() {
    this.logic_bitmap = this.buffer.slice(0, block_size);
    this.buffer = this.buffer.slice(block_size);
}

FsMinix.prototype.toString = function() {
    let ret = '';
    ret += `image size : ${this.origin_buffer.length}\n`;
    ret += this.super_block_meta.map((p) => {
        return `${p.a} : ${this.super_block[p.a]}`;
    }).join('\n');
    return ret;
}
 
function main() {
    program
        .version('0.0.1')
        .option('-i, --image [value]', 'select minix fs image')
        .parse(process.argv);
    if (program.image) {
        const image_name = program.image;
        fs.readFile(image_name, (err, data) => {
            let fsm = new FsMinix(data);
            console.log(fsm.toString());
        });
    }
}

main();
