nasm -o loader.bin loader.asm -l loader.lst
nasm -o boot.bin boot.asm -l boot.lst
dd if=loader.bin of=a.img bs=512 count=1 conv=notrunc
dd if=boot.bin of=a.img bs=512 count=17 seek=1 conv=notrunc