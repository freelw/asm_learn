BOOTSEG = 0X07c0
SYSSEG = 0x1000
SYSLEN = 17
entry start
start:
    jmpi go, #BOOTSEG
go:
    mov ax, cs
    mov ds, ax
    mov ss, ax
    mov sp, #0x400
load_system:
    mov dx, #0x0000
    mov cx, #0x0002
    mov ax, #SYSSEG
    mov es, ax
    xor bx, bx
    mov ax, #0x200+SYSLEN
    int 0x13
    jnc ok_load
die:    jmp die
ok_load:
    cli
    mov ax, #SYSSEG
    mov ds, ax
    xor ax, ax
    mov es, ax
    mov cx, #0x1000
    sub si, si
    sub di, di
    rep
    movw
    mov ax, #BOOTSEG
    mov ds, ax
    lidt idt_48
    lgdt gdt_48
    mov ax, #0x0001
    lmsw ax
    jmpi 0, 8
gdt:
    .word 0, 0, 0, 0
    .word 0x07ff
    .word 0x0000
    .word 0x9a00
    .word 0x00c0

    .word 0x07ff
    .word 0x0000
    .word 0x9200
    .word 0x00c0

idt_48:
    .word 0
    .word 0, 0
gdt_48:
    .word 0x7ff
    .word 0x7c00+gdt, 0
.org 510
    .word 0xAA55
