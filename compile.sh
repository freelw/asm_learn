#!/bin/bash
rm a.img
NASM="./nasm-2.14.03rc2/nasm"
${NASM} -o loader.bin loader.asm -l loader.lst
${NASM} -o boot.bin boot.asm -l boot.lst
dd if=loader.bin of=a.img bs=512 count=1 conv=notrunc
dd if=boot.bin of=a.img bs=512 count=17 seek=1 conv=notrunc
head -c 1474560 /dev/zero > a.vfd
dd if=a.img of=a.vfd bs=512 count=18 conv=notrunc
