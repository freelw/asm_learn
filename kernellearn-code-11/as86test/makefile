all:
	as86 -0 -a -o boot.o boot.s
	ld86 -0 -s -o boot.img boot.o
	dd bs=32 if=boot.img of=_boot.img skip=1
cleanall:
	rm *.o
	rm *.img
