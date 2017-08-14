'use strict'

const fs = require('fs');
const program = require('commander');
const mkdirp = require('mkdirp');
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
    this.inodes = [new Inode(new Buffer(32), true, 0, this)];
    for (let i = 1; i < s_ninodes; ++ i) {
        const index = i-1;
        this.inodes.push(new Inode(this.inodes_buffer.slice(32*index, 32*index+32), this.getInodeStatus(i), i, this));
    }

    this.initInodesFullPath();
}

FsMinix.prototype.initInodesFullPath = function() {
    dfs(this.inodes[1], [''], this);
}

function dfs(cur_inode, path, fsm) {
    cur_inode.full_path = path.join('/');
    if (4 == cur_inode.inode_type) {
        for (let i = 2; i < cur_inode.file_list.length; ++ i) {
            const _node = cur_inode.file_list[i];
            const son_inode_index = _node.inode;
            const name = _node.name;
            const son_inode = fsm.inodes[son_inode_index];
            dfs(son_inode, path.concat([name]), fsm);
        }    
    } else if (8 == cur_inode.inode_type) {
        // file
    } else {
        console.error('unknown type');
    }
}

FsMinix.prototype.getBlockData = function(index) {
    const start = index * block_size;
    return this.origin_buffer.slice(start, start+block_size);
}

FsMinix.prototype.toString = function() {
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
        this.i_gid = buffer.readInt8();
        offset += 1;
        this.i_nlinks = buffer.readInt8();
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
                for (let j = 0; j < 512; ++ i) {
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

Inode.prototype.getDataBuffer = function() {
    this.data_buffer = new Buffer(0);
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

function listAllFile(fsm) {
    fsm.inodes
        .filter((inode) => { return inode.status; })
        .forEach((inode) => {
            console.log([inode.inode_type, inode.full_path].join('|'));
        });
}

function mkdirs(fsm, dir) {
    return Promise.all(
        fsm.inodes
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

function writeFile(fsm, dir) {
    return () => {
        return Promise.all(
            fsm.inodes
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

function release(fsm, dir) {
    mkdirs(fsm, dir)
        .then(writeFile(fsm, dir))
        .catch((err) => {
            console.error('release error : ', err);
        });
}
 
function main() {
    program
        .version('0.0.1')
        .option('-i, --image [value]', 'select minix fs image')
        .option('-d, --dir [value]', 'select release dir')
        .parse(process.argv);
    if (program.image) {
        const image_name = program.image;
        fs.readFile(image_name, (err, data) => {
            let fsm = new FsMinix(data);
            console.log(fsm.toString());
            if (program.dir) {
                release(fsm, program.dir);
            } else {
                console.error('release dir not selected');
            }
        });
    }
}

main();
