SYSSEG = 0x1000
SYSLEN = 17
entry start
start:
    mov dx, #0x0000
    mov cx, #0x0002
    mov ax, #SYSSEG
    mov es, ax
    xor bx, bx
    mov ax, #0x200+SYSLEN
    int 0x13
die:    jmp die
.org 510
    .word 0xAA55
my_magic:
    .word 0xfeed
    .word 0xfeed
    .word 0xfeed
    .word 0xfeed
    .word 0xfeed
    .word 0xfeee
