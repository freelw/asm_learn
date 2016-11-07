nasm -o loader.bin loader.asm
dd if=loader.bin of=a.img bs=512 count=2 conv=notrunc