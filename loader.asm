SYSSEG equ 01000h
SYSLEN equ 17
org 07c00h
jmp 07c0h:5
    mov ax, cs
    mov ds, ax
    mov ss, ax
    mov sp, 0400h
load_system:
    mov dx, 00000h
    mov cx, 00002h
    mov ax, SYSSEG
    mov es, ax
    xor bx, bx
    mov ax, 0200h+SYSLEN
    int 013h
    jnc ok_load
    jmp $
ok_load:
    jmp 01000h:0
    times 510 - ($-$$) db 0
    dw 0xaa55
