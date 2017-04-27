    mov ax, 0b800h  ;初始化ds指向显存
    mov ds, ax
    xor ax, ax      ;初始化es指向0
    mov es, ax
    mov si, BootMessage ;es:si指向字符串BootMessage
    sub di, di          ;ds:di指向显存的开始位置
    mov cx, 16          ;准备移动16次
loop0:
    mov al, [es:si]
    mov ah, 00000010B
    mov [di], ax
    inc si
    inc di
    inc di
    dec cx
    jnz loop0
    jmp $
DispStr:
    mov ax, BootMessage
    mov bp, ax
    mov cx, 16
    mov ax, 01301h
    mov bx, 000ch
    mov dl, 0
    int 10h
    ret
BootMessage:
    db "Hello, OS world!"
