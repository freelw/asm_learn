'use strict'

const fs = require('fs');
const program = require('commander');
const FsMinixReader = require('./FsMinixReader');

function main() {
    program
        .version('0.0.1')
        .option('-i, --image [value]', 'select minix fs image')
        .option('-d, --dir [value]', 'select release dir')
        .parse(process.argv);
    if (program.image) {
        const image_name = program.image;
        fs.readFile(image_name, (err, data) => {
            let fsm = new FsMinixReader(data);
            console.log(fsm.toString());
            if (program.dir) {
                fsm.release(program.dir);
            } else {
                console.error('release dir not selected');
            }
        });
    }
}

main();
