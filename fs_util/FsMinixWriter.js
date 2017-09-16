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
    this.initLogZoneBitMap();
    this.getInodes();
    this.initInodeBitMap();
    this.joinBuffer();
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

    this.buffer = zero_buffer(this.super_block.s_nzones * block_size);

    let offset = block_size; //跳过引导块
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

FsMinixWriter.prototype.initLogZoneBitMap = function() {
    this.log_zone_bitmap = zero_buffer(block_size * this.super_block.s_zmap_blocks);
    this.log_zones = [];
    for (let i = 0; i < this.super_block.s_nzones - this.super_block.s_firstdatazone; ++ i) {
        this.log_zones.push(zero_buffer(block_size));
    }
    this.setLogZoneStatus(0);
}

FsMinixWriter.prototype.setLogZoneStatus = function(index) {
    const base = parseInt(index / 8);
    const offset = index % 8;
    let u8 = this.log_zone_bitmap.slice(base, base+1).readUInt8();
    u8 |= 1 << offset;
    this.log_zone_bitmap.writeUInt8(u8, base);
}

FsMinixWriter.prototype.getLogZoneStatus = function(index) {
    const base = parseInt(index / 8);
    const offset = index % 8;
    const u8 = this.log_zone_bitmap.slice(base, base+1).readUInt8();
    return !!(u8 & (1 << offset));
}

FsMinixWriter.prototype.requestFreeLogZone = function() {
    for (let i = 1; i <= this.super_block.s_nzones - this.super_block.s_firstdatazone; ++ i) {
        if (!this.getLogZoneStatus(i)) {
            this.setLogZoneStatus(i);
            return {
                index : i-1+this.super_block.s_firstdatazone,
                buffer : this.log_zones[i-1]
            }
        }
    }
    return { //失败，没有可用的log_zone了 
        index : 0
    }
}

FsMinixWriter.prototype.getBuffer = function() {
    return this.buffer;
}

FsMinixWriter.prototype.getInodes = function() {
    this.inodes = [];
    const index = Inode.getNewIndex();
    const root_inode = new Inode(this.dir, index, index, this);
    this.insertInode(root_inode);
    dfs(root_inode, this);
    this.inodes.forEach((inode) => {
        inode.display();
    });
}

FsMinixWriter.prototype.initInodeBitMap = function() {
    this.inode_bitmap = zero_buffer(block_size * this.super_block.s_imap_blocks);
    for (let i = 0; i <= this.inodes.length; ++ i) {
        this.setInodeStatus(i);
    }
}

FsMinixWriter.prototype.setInodeStatus = function(index) {
    const base = parseInt(index / 8);
    const offset = index % 8;
    let u8 = this.inode_bitmap.slice(base, base+1).readUInt8();
    u8 |= 1 << offset;
    this.inode_bitmap.writeUInt8(u8, base);
}

FsMinixWriter.prototype.insertInode = function(inode) {
    this.inodes.push(inode);
}

FsMinixWriter.prototype.joinBuffer = function() {
    let offset = block_size * 2;
    this.inode_bitmap.copy(this.buffer, offset);
    offset += this.inode_bitmap.length;
    this.log_zone_bitmap.copy(this.buffer, offset);
    offset += this.log_zone_bitmap.length;
    for (let i = 0; i < this.inodes.length; ++ i) {
        const inode_buffer = this.inodes[i].getMetaBuffer();
        inode_buffer.copy(this.buffer, offset);
        offset += inode_buffer.length;
    }
    offset = this.super_block.s_firstdatazone * block_size;
    for (let i = 0; i < this.log_zones.length; ++ i) {
        const log_zone_buffer = this.log_zones[i];
        log_zone_buffer.copy(this.buffer, offset);
        if (0 == i) {
            console.log('log_zone_buffer : ', log_zone_buffer.slice(34, 48).toString());
            console.log('this.buffer : ', this.buffer.slice(offset+34, offset+48).toString());
        }
        offset += log_zone_buffer.length;
    }
    console.log('After join buffer offset : ', offset);
    const right_size = this.super_block.s_nzones * block_size;
    if (right_size == offset) {
        console.log('offset equal this.super_block.s_nzones * block_size');
    } else {
        console.log('offset is different from this.super_block.s_nzones * block_size : ', right_size);
    }
}

function dfs(root_inode, fsm) {
    const files = root_inode.getFiles().filter((item) => {
        return '.' != item.file_name && '..' != item.file_name;
    });
    files.forEach((file) => {
        const file_name = root_inode.file_name + '/' + file.file_name;
        console.log('dfs file_name : ', file_name);
        const inode = new Inode(file_name, file.index, root_inode.index, fsm);
        fsm.insertInode(inode);
        if (inode.isDir()) {
            dfs(inode, fsm);
            root_inode.i_nlinks ++;
        }
    });
}

function Inode(file_name, index, root_index, fsm) {
    this.file_name = file_name;
    this.index = index;
    this.fsm = fsm;
    this.i_mode = 511; //0777
    this.inode_type = fs.statSync(this.file_name).isDirectory() ? 4 : 8;
    this.i_mode |= this.inode_type << 12;
    console.log('this.i_mode : ', this.i_mode);
    this.i_uid = 0;
    this.i_mtime = 0;
    this.i_gid = 0;
    this.i_nlinks = this.isDir() ? 2 : 1;
    if (this.isDir()) {
        let files = fs.readdirSync(this.file_name);
        files = ['.', '..'].concat(files);
        this.i_size = files.length * 16;
        this.n_files = files.length;
        this.buffer = zero_buffer(this.i_size);
        let offset = 0;
        files.forEach((file_name) => {
            let index = 0;
            if ('.' == file_name) {
                index = this.index;
            } else if ('..' == file_name) {
                index = root_index;
            } else {
                index = Inode.getNewIndex();
            }
            console.log('index : ', index);
            console.log('this.index : ', this.index);
            console.log('root_index : ', root_index);
            console.log('offset : ', offset);
            this.buffer.writeInt16LE(index, offset);
            offset += 2;
            file_name = file_name.slice(0, 14);
            console.log('file_name : ', file_name);
            this.buffer.write(file_name, offset);
            offset += 14;
        });
    } else {
        this.buffer = fs.readFileSync(this.file_name);
        this.i_size = this.buffer.length;
    }
    this.saveIZone();
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

Inode.prototype.saveIZone = function() {
    this.i_zone = [];
    for (let i = 0; i < 9; ++ i) {
        this.i_zone.push(0);
    }
    let flat_i_zone = [];
    let t_buffer = new Buffer(this.buffer);
    while (0 < t_buffer.length) {
        let log_zone_info = this.fsm.requestFreeLogZone();
        let index = log_zone_info.index;
        let buffer = log_zone_info.buffer;
        if (0 == index) {
            throw Error("saveIZone Failed, no log zone");
        }
        let ready2copy = t_buffer.slice(0, block_size);
        if (4 == this.inode_type) {
            console.log('ready2copy : ', ready2copy.slice(2, 16).toString());
            console.log('ready2copy : ', ready2copy.slice(18, 32).toString());
            console.log('ready2copy : ', ready2copy.slice(34, 48).toString());
        }
        ready2copy.copy(buffer);
        flat_i_zone.push({index, buffer});
        t_buffer = t_buffer.slice(block_size);
    }

    for (let i = 0; i < Math.min(flat_i_zone.length, 7); ++ i) {
        console.log('flat_i_zone[i].index : ', flat_i_zone[i].index);
        console.log('flat_i_zone[i].buffer.length : ', flat_i_zone[i].buffer.length);
        this.i_zone[i] = flat_i_zone[i].index;
    }

    if (7 < flat_i_zone.length) {
        let log_zone_info = this.fsm.requestFreeLogZone();
        let index = log_zone_info.index;
        let buffer = log_zone_info.buffer;
        if (0 == index) {
            throw Error("saveIZone Failed, no log zone");
        }
        this.i_zone[7] = index;
        let offset = 0;
        for (let i = 7; i < Math.min(flat_i_zone.length, 7 + 512); ++ i) {
            buffer.writeInt16LE(flat_i_zone[i].index, offset);
            offset += 2;
        }
    }

    if (7 + 512 < flat_i_zone.length) {
        let log_zone_info = this.fsm.requestFreeLogZone();
        let index = log_zone_info.index;
        let buffer = log_zone_info.buffer;
        if (0 == index) {
            throw Error("saveIZone Failed, no log zone");
        }
        let buffer_lv1 = buffer;
        this.i_zone[8] = index;
        let i = 7 + 512;
        let offset_lv1 = 0;
        while (i < flat_i_zone.length) {
            let log_zone_info = this.fsm.requestFreeLogZone();
            let index = log_zone_info.index;
            let buffer = log_zone_info.buffer;
            if (0 == index) {
                throw Error("saveIZone Failed, no log zone");
            }
            let buffer_lv2 = buffer;
            buffer_lv1.writeInt16LE(index, offset_lv1);
            offset_lv1 += 2;
            let offset_lv2 = 0;
            for (let j = i; j < Math.min(i+512, flat_i_zone.length); ++ j) {
                buffer_lv2.writeInt16LE(flat_i_zone[j].index, offset_lv2);
                offset_lv2 += 2;
            }
            i += 512;
        }
    }
}

Inode.prototype.getMetaBuffer = function() {
    let buffer = zero_buffer(32);
    let offset = 0;
    buffer.writeUInt16LE(this.i_mode, offset);
    offset += 2;
    buffer.writeInt16LE(this.i_uid, offset);
    offset += 2;
    buffer.writeInt32LE(this.i_size, offset);
    offset += 4;
    buffer.writeInt32LE(this.i_mtime, offset);
    offset += 4;
    buffer.writeInt8(this.i_gid, offset);
    offset += 1;
    buffer.writeInt8(this.i_nlinks, offset);
    offset += 1;
    for (let i = 0; i < 9; ++ i) {
        buffer.writeInt16LE(this.i_zone[i], offset);
        offset += 2;
    }
    return buffer;
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

Inode.index = 1;

module.exports = FsMinixWriter;
