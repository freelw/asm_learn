'use strict'

const fs = require('fs');
const program = require('commander');
const FsMinixReader = require('./FsMinixReader');
const FsMinixWriter = require('./FsMinixWriter');

function main() {
    program
        .version('0.0.1')
        .option('-i, --image [value]', 'select minix fs image')
        .option('-d, --dir [value]', 'select release/compress dir')
        .option('-o, --out [value]', 'output image path')
        .parse(process.argv);
    if (program.image) {
        const image_name = program.image;
        if (program.dir) {
            fs.readFile(image_name, (err, data) => {
                if (err) {
                    console.error('readFile error : ', err);
                } else {
                    let fsmReader = new FsMinixReader(data);
                    fsmReader.inodes.filter((inode) => {
                        //return fsmReader.getInodeStatus(inode.index+1);
                        return inode.status;
                    }).forEach((inode) => {
                        inode.display();
                    });
                    console.log(fsmReader.toString());
                    fsmReader.release(program.dir);
                }
            });
        } else {
            console.error('release dir not selected');
        }
    } else if (program.out) {
        const image_name = program.out;
        if (program.dir) {
            let fsmWriter = new FsMinixWriter(program.dir);
            fs.writeFile(image_name, fsmWriter.getBuffer(), (err) => {
                if (err) {
                    console.error('writeFile error :', err);
                }
            });
        } else {
            console.error('compress dir not selected');
        }
    }
}

main();
