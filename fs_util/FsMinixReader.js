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

function FsMinixReader(buffer) {
    this.buffer = buffer;
    this.origin_buffer = new Buffer(buffer);
    this.readBootBlock();
    this.readSuperBlock();
    this.readInodeBitMap();
    this.readLogicBitMap();
    this.readInodes();
}

FsMinixReader.prototype.readBootBlock = function() {
    this.buffer = this.buffer.slice(block_size);
}

FsMinixReader.prototype.readSuperBlock = function() {
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

FsMinixReader.prototype.readInodeBitMap = function() {
    const s_imap_block_size = block_size * this.super_block.s_imap_blocks;
    this.inode_bitmap = this.buffer.slice(0, s_imap_block_size);
    this.buffer = this.buffer.slice(s_imap_block_size);
}

//inode bitmap 具体排布顺序见《linux 内核完全剖析》P603
FsMinixReader.prototype.getInodeStatus = function(index) {
    const base = parseInt(index / 8);
    const offset = index % 8;
    const u8 = this.inode_bitmap.slice(base, base+1).readUInt8();
    return !!(u8 & (1 << offset));
}

FsMinixReader.prototype.readLogicBitMap = function() {
    const s_zmap_block_size = block_size * this.super_block.s_zmap_blocks;
    this.logic_bitmap = this.buffer.slice(0, s_zmap_block_size);
    this.buffer = this.buffer.slice(s_zmap_block_size);
}

FsMinixReader.prototype.readInodes = function() {
    const s_ninodes = this.super_block['s_ninodes'];
    this.inodes_buffer = this.buffer.slice(0, 32*s_ninodes);
    this.origin_inodes_buffer = new Buffer(this.inodes_buffer);
    const f_s_inodemap_blocks = s_ninodes/32;
    let s_inodemap_blocks = parseInt(f_s_inodemap_blocks, 10);
    //如果没有整除，则还需要一块
    if (f_s_inodemap_blocks > s_inodemap_blocks) {
        s_inodemap_blocks += 1;
    } 
    this.buffer = this.buffer.slice(4*block_size);
    this.inodes = [];
    for (let i = 1; i < s_ninodes; ++ i) {
        this.inodes.push(new Inode(this.inodes_buffer.slice(32*(i-1), 32*i), this.getInodeStatus(i), i, this));
    }
    this.initInodesFullPath();
}

FsMinixReader.prototype.initInodesFullPath = function() {
    dfs(this.inodes[0], [''], this);
}

function dfs(cur_inode, path, fsm) {
    if (cur_inode) {
        cur_inode.full_path = path.join('/');
        if (4 == cur_inode.inode_type) {
            for (let i = 2; i < cur_inode.file_list.length; ++ i) {
                const _node = cur_inode.file_list[i];
                const son_inode_index = _node.inode;
                const name = _node.name;
                const son_inode = fsm.inodes[son_inode_index-1];
                dfs(son_inode, path.concat([name]), fsm);
            }    
        } else if (8 == cur_inode.inode_type) {
            // file
        } else {
            console.error('unknown type');
        }
    }
}

FsMinixReader.prototype.getBlockData = function(index) {
    const start = index * block_size;
    return this.origin_buffer.slice(start, start+block_size);
}

FsMinixReader.prototype.toString = function() {
    let ret = '';
    ret += `image size : ${this.origin_buffer.length}\n`;
    ret += this.super_block_meta.map((p) => {
        return `${p.a} : ${this.super_block[p.a]}`;
    }).join('\n');
    return ret;
}

function Inode(buffer, status, index, fsm) {
    this.status = status;
    this.index = index;
    this.fsm = fsm;
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
        this.i_gid = buffer.readInt8(offset);
        offset += 1;
        this.i_nlinks = buffer.readInt8(offset);
        offset += 1;
        this.getType();
        this.i_zone = [];
        for (let i = 0; i < 7; ++ i) {
            const block_no = buffer.readInt16LE(offset);
            offset += 2;
            this.i_zone.push(block_no);
        }
        if (block_size * 7 < this.i_size) {
            let left_size = this.i_size - block_size * 7;
            const block_no = buffer.readInt16LE(offset);
            offset += 2;
            const buffer_zone7 = this.fsm.getBlockData(block_no);
            for (let i = 0; i < 512; ++ i) {
                this.i_zone.push(buffer_zone7.readInt16LE(i*2));
                left_size -= block_size;
                if (left_size <= 0) {
                    break;
                }
            }
        }
        if (block_size * (7 + 512) < this.i_size) {
            let left_size = this.i_size - block_size * (7 + 512);
            const block_no = buffer.readInt16LE(offset);
            offset += 2;
            const buffer_zone8 = this.fsm.getBlockData(block_no);
            for (let i = 0; i < 512; ++ i) {
                const _block_no = buffer_zone8.readInt16LE(i*2);
                const _zone = this.fsm.getBlockData(_block_no);
                for (let j = 0; j < 512; ++ j) {
                    this.i_zone.push(_zone.readInt16LE(j*2));
                    left_size -= block_size;
                    if (left_size <= 0) {
                        break;
                    }
                }
                if (left_size <= 0) {
                    break;
                }
            }
        }
        this.getDataBuffer();
        this.getListOfDirFile();
    }
}

Inode.prototype.getType = function() {
    this.inode_type = (this.i_mode >> 12) & 0xf;
    if (8 == this.inode_type) {
        //file
    } else if (4 == this.inode_type){
        //directory
    } else {
        console.log('unknown type : ', this.inode_type);
    }
}

Inode.prototype.isDir = function() {
    return 4 == this.inode_type;
}

Inode.prototype.getDataBuffer = function() {
    this.data_buffer = zero_buffer(0);
    let left_size = this.i_size;
    let cur_zone_index = 0;
    while (left_size > 0) {
        if (this.i_zone.length > cur_zone_index) {
            const this_size = left_size > block_size ? block_size : left_size;
            const block_data = this.fsm.getBlockData(this.i_zone[cur_zone_index]).slice(0, this_size);
            this.data_buffer = Buffer.concat([this.data_buffer, block_data]);
            left_size -= block_size;
            ++ cur_zone_index;
        }
    }
}

Inode.prototype.getListOfDirFile = function() {
    if (4 == this.inode_type) { //is directory
        this.file_list = [];
        for (let i = 0; i < this.data_buffer.length / 16; ++ i) {
            const start = i*16;
            this.file_list.push(new DirEntry(this.data_buffer.slice(start, start+16)));
        }
    }
}

Inode.prototype.display = function() {
    console.log('----inode display begin----');
    console.log('index : ', this.index);
    console.log('i_gid : ', this.i_gid);
    console.log('i_uid : ', this.i_uid);
    console.log('i_size : ', this.i_size);
    console.log('isDir : ', this.isDir());
    console.log('inode_type : ', this.inode_type);
    console.log('this.i_nlinks : ', this.i_nlinks);
    console.log('this.i_zone[0] : ', this.i_zone[0]);
    console.log('-----inode display end-----');
}

function DirEntry(buffer) {
    this.inode = buffer.readInt16LE(buffer);
    this.name = buffer
        .slice(2, 16)
        .toString()
        .split('')
        .filter((ch) => {
            return ch != '\u0000';
        })
        .join('');
}

FsMinixReader.prototype.mkdirs = function(dir) {
    return Promise.all(
        this.inodes
            .filter((inode) => { return inode.status && 4 == inode.inode_type; })
            .map((inode) => {
                return new Promise((resolve, reject) => {
                    const _dir = dir + '/' + inode.full_path.slice(1);
                    mkdirp(_dir, (err) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve();
                        }
                    });
                });
            })
    );
}

FsMinixReader.prototype.writeFile = function(dir) {
    return () => {
        return Promise.all(
            this.inodes
                .filter((inode) => { return inode.status && 8 == inode.inode_type; })
                .map((inode) => {
                    return new Promise((resolve, reject) => {
                        const path = dir + '/' + inode.full_path;
                        fs.writeFile(path, inode.data_buffer, (err) => {
                            if (err) {
                                reject(err);
                            } else {
                                resolve();
                            }
                        });
                    })
                })
        );
    }
}

FsMinixReader.prototype.release = function(dir) {
    this.mkdirs(dir)
        .then(this.writeFile(dir))
        .catch((err) => {
            console.error('release error : ', err);
        });
}

module.exports = FsMinixReader;
