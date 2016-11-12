all: head boot
	dd bs=512 if=head.img of=_boot.img seek=1

boot:
	as86 -0 -a -o boot.o boot.s
	ld86 -0 -s -o boot.img boot.o
	dd bs=32 if=boot.img of=_boot.img skip=1

head:
	as --32 -o head.o head.s
	ld -Ttext 0 -m elf_i386 -nostdlib -s -x -o head.img head.o --oformat binary

cleanall:
	rm *.o
	rm *.img
