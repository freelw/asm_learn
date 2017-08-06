const fs = require('fs');
const program = require('commander');
 
function main() {
    program
        .version('0.0.1')
        .option('-i, --image [value]', 'select minix fs image')
        .parse(process.argv);
    if (program.image) {
        const image_name = program.image;
        fs.readFile(image_name, (err, data) => {
            console.log('image size : ', data.length);


        });
    }
}

main();
