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
    this.readInodes();
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

FsMinix.prototype.readInodes = function() {
    const s_ninodes = this.super_block['s_ninodes'];
    this.inodes_buffer = this.buffer.slice(0, 32*s_ninodes);
    this.origin_inodes_buffer = new Buffer(this.inodes_buffer);
    this.buffer = this.buffer.slice(4*block_size);
    this.inodes = [];
    console.log('inodes_buffer.length : ', this.inodes_buffer.length);
    console.log('s_ninodes : ', s_ninodes);
    for (let i = 1; i < s_ninodes; ++ i) {
        const index = i-1;
        this.inodes.push(new Inode(this.inodes_buffer.slice(32*index, 32*index+32), this.getInodeStatus(i), i));
    }
}

FsMinix.prototype.toString = function() {
    let ret = '';
    ret += `image size : ${this.origin_buffer.length}\n`;
    ret += this.super_block_meta.map((p) => {
        return `${p.a} : ${this.super_block[p.a]}`;
    }).join('\n');
    return ret;
}

function Inode(buffer, status, index) {
    this.status = status;
    this.index = index;
    if (status) {        
        let offset = 0;
        this.i_mode = buffer.readInt16LE(offset);
        offset += 2;
        this.i_uid = buffer.readInt16LE(offset);
        offset += 2;
        this.i_size = buffer.readInt32LE(offset);
        offset += 4;
        this.i_mtime = buffer.readInt32LE(offset);
        offset += 4;
        this.i_gid = buffer.readInt8();
        offset += 1;
        this.i_nlinks = buffer.readInt8();
        offset += 1;
        console.log('this.i_size : ', this.i_size);
        this.getType();
    }
}

Inode.prototype.getType = function() {
    const tmp = (this.i_mode >> 12) & 0xf;
    if (8 == tmp) {
        console.log('normal file');
    } else if (4 == tmp){
        console.log('dir file');
    } else {
        console.log('unknown type : ', tmp);
    }
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
