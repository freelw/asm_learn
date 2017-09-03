'use strict'

const fs = require('fs');
const mkdirp = require('mkdirp');
const block_size = 1024;

function zero_buffer(size) {
    let ret = new Buffer(size);
    for (let i = 0; i < size; ++ i) {
        ret[i] = 0;
    }
    return ret;
}

function pair(a, b) {
    return {a, b};
}

function FsMinixWriter(dir) {
    this.dir = dir;
    this.initSuperBlock();
    this.getInodes();
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

    this.buffer = new Buffer(this.super_block.s_nzones * block_size);

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

FsMinixWriter.prototype.getBuffer = function() {
    return this.buffer;
}

FsMinixWriter.prototype.getInodes = function() {
    this.inodes = [];
    const root_inode = new Inode(this.dir, Inode.getNewIndex());
    root_inode.i_nlinks = 0;
    this.insertInode(root_inode);
    dfs(root_inode, this);
    this.inodes.forEach((inode) => {
        inode.display();
    });
}

FsMinixWriter.prototype.insertInode = function(inode) {
    this.inodes.push(inode);
}

function dfs(root_inode, fsw) {
    const files = root_inode.getFiles();
    files.forEach((file) => {
        const file_name = root_inode.file_name + file.file_name;
        const inode = new Inode(file_name, file.index);
        fsw.insertInode(inode);
        if (inode.isDir()) {
            dfs(inode, fsw);
        }
    });
}

function Inode(file_name, index) {
    this.file_name = file_name;
    this.i_mode = 511;
    this.i_uid = 0;
    this.i_mtime = Date.now();
    this.i_gid = 0;
    this.index = index;
    this.inode_type = fs.statSync(this.file_name).isDirectory() ? 4 : 8;
    this.i_nlinks = this.isDir() ? 2 : 1;
    if (this.isDir()) {
        const files = fs.readdirSync(this.file_name);
        this.i_size = files.length * 16;
        this.n_files = files.length;
        this.buffer = zero_buffer(this.i_size);
        let offset = 0;
        files.forEach((file_name) => {
            const index = Inode.getNewIndex();
            this.buffer.writeInt16LE(index, offset);
            offset += 2;
            file_name = file_name.slice(0, 14);
            this.buffer.write(file_name, offset);
            offset += 14;
        });
    } else {
        this.buffer = fs.readFileSync(this.file_name);
        this.i_size = this.buffer.length;
    }
}

Inode.prototype.isDir = function() {
    return 4 == this.inode_type;
}

Inode.prototype.getFiles = function() {
    let files = [];
    if (this.isDir()) {
        let offset = 0;
        for (let i = 0; i < this.n_files; ++ i) {
            const index = this.buffer.readInt16LE(offset);
            offset += 2;
            const file_name = this.buffer
                .slice(offset, offset+14)
                .toString()
                .split('')
                .filter((ch) => {
                    return ch != '\u0000';
                })
                .join('');
            offset += 14;
            files.push({
                index,
                file_name
            });
        }
    }
    return files;
}

Inode.prototype.display = function() {
    console.log('----inode display begin----');
    console.log('index : ', this.index);
    console.log('file_name : ', this.file_name);
    console.log('i_size : ', this.i_size);
    console.log('isDir : ', this.isDir());
    console.log('this.i_nlinks : ', this.i_nlinks);
    console.log('-----inode display end-----');
}

Inode.getNewIndex = function() {
    return Inode.index ++;
}

Inode.index = 0;

module.exports = FsMinixWriter;
