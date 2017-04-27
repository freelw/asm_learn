SYSSEG equ 01000h
SYSLEN equ 17
jmp 07c0h:(load_system-$)
load_system:
    mov dx, 00000h
    mov cx, 00002h
    mov ax, SYSSEG
    mov es, ax              ;es:bx 01000h:0h bios读取磁盘写入内存的目标位置
    xor bx, bx
    mov ax, 0200h+SYSLEN    ;ah 读扇区功能号2 al读扇区数量 17
    int 013h
    jnc ok_load
    jmp $
ok_load:
    cli
    ;jmp SYSSEG:0            ;读取完成之后跳转
    mov ax, SYSSEG          ;开始把010000h位置的数据拷贝到0h处
    mov ds, ax              ;注意这时bios的代码就会被冲掉，无法再使用int 10h
    xor ax, ax
    mov es, ax
    mov cx, 0x1000
    sub si, si
    sub di, di
    cld
    rep movsw
    jmp 0:0
    times 510 - ($-$$) db 0
    dw 0xaa55
