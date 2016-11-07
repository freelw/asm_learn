nasm -o loader.bin loader.asm
nasm -o boot.bin boot.asm
dd if=loader.bin of=a.img bs=512 count=1 conv=notrunc
dd if=boot.bin of=a.img bs=512 count=1 seek=1 conv=notrunc