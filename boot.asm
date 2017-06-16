[BITS 32]

LATCH equ 11930
SCRN_SEL equ 0x18
TSS0_SEL equ 0x20
LDT0_SEL equ 0x28
TSS1_SEL equ 0x30
LDT1_SEL equ 0x38

start_up32:
    mov dword eax, 0x10 ;这时候使用的0x10还是loader.asm中定义的,虽然boot.asm之后定义的0x10描述符与之完全相同
    mov ds, ax
    lss esp, [init_stack];接下来要使用call指令，所以这里要初始化好栈
    call setup_gdt
    call setup_idt

    mov eax, 0x10   ;加载完gdt之后重新加载所有的段寄存器，因为要更新段寄存器中段描述符的缓存（不可见部分）参见《linux内核完全剖析》94页
    mov ds, ax
    mov es, ax
    mov fs, ax
    mov gs, ax

    lss esp, [init_stack];因为ds可能更新了（这个例子中实际上没有），所以要重新加载ss

    ;设置频率100Hz
    mov byte al, 0x36
    mov dword edx, 0x43
    out dx, al
    mov dword eax, LATCH
    mov dword edx, 0x40
    out dx, al
    mov al, ah
    out dx, al

    mov dword eax, 0x00080000
    mov ax, timer_interrupt          ;这里应该是假设了timer_interrupt的地址是16位的
    mov dx, 0x8e00
    lea esi, [idt+64]
    mov dword [esi], eax 
    mov dword [esi+4], edx 

    mov ax, system_interrupt        ;这里也使用了0x0008作为段选择符
    mov dx, 0xef00                  ;ef是11101111陷阱门，用户的中断是可以被其他的中断打断的
    lea esi, [idt+0x80*8]
    mov dword [esi], eax 
    mov dword [esi+4], edx

    pushf
    and dword [esp], 0xffffbfff 
    popf
    mov dword eax, TSS0_SEL
    ltr ax
    mov dword eax, LDT0_SEL
    lldt ax
    mov  dword [current], 0
    sti                             ;开终端，到第一个ret之后才会生效，防止在iret之前被打断，参见intel ia32文档sti指令的描述

    ;从这里开始构造栈，准备iret到特权级3
    ;iret会弹出5个参数，eip ecs eflags 原esp 原ss，所以这里反过来构造
    push dword 0x17
    push dword init_stack
    pushf               
    push dword 0x0f
    push dword task0
    iret

setup_gdt:
    lgdt [lgdt_48]
    ret

setup_idt:
    lea edx, [ignore_int]
    mov eax, dword 0x00080000
    mov ax, dx
    mov dx, 0x8e00
    lea edi, [idt]
    mov ecx, 256
rp_idt:
    mov dword [edi], eax
    mov dword [edi+4], edx
    add dword edi, 8
    dec ecx
    jne rp_idt
    lidt [lidt_48]
    ret

write_char:
    push gs
    push dword ebx
    mov ebx, SCRN_SEL
    mov gs, bx
    mov bx, [src_loc]
    shl ebx, 1
    mov byte [gs:ebx], al
    shr ebx, 1
    inc dword ebx
    cmp dword ebx, 2000
    jb not_equ          ;jb : jump if below
    mov dword ebx, 0
not_equ:
    mov dword [src_loc], ebx
    pop dword ebx
    pop gs
    ret

align 4
ignore_int:
    push ds
    push dword eax
    mov dword eax, 0x10
    mov ds, ax  ;指向内核数据段
    mov dword eax, 67 ;print "C"
    call write_char
    pop dword eax
    pop ds
    iret

align 4
timer_interrupt:
    push ds
    push dword eax
    mov dword eax, 0x10
    mov ds, ax          ;指向内核数据段
    
    mov byte al, 0x20
    out byte 0x20, al
    
    ;在timer_interrupt中判断被中断的代码是用户态还是内核态，
    ;如果是用户态，打印U，内核态打印K
    push dword eax
    cmp word [esp+16], 0x0f
    jne try_0x08
    mov dword eax, 85 ;print "U" from user mode
    jmp done
try_0x08:
    cmp word [esp+16], 0x08
    jne unknown
    mov dword eax, 75 ;print "K" from kernel
    jmp done
unknown:
    mov dword eax, 84 ;print "T"
done:
    call write_char
    pop dword eax
    ;判断打印结束
    
    mov dword eax, 1
    cmp dword eax, [current]
    je run0                 ;je: jump if equal
    mov dword [current], 1
    jmp dword TSS1_SEL:0
    jmp over
run0:
    mov dword [current], 0
    jmp dword TSS0_SEL:0
over:
    pop dword eax
    pop ds
    iret

align 4
system_interrupt:
    push ds
    push dword edx
    push dword ecx
    push dword ebx
    push dword eax
    mov dword edx, 0x10 ;指向内核数据段
    mov ds, dx
    call write_char
    mov dword ecx, 0xfff
sys_loop:                   ;这里增加一个循环，为了使在系统调用的时候更有可能被时钟中断
    loop sys_loop
    pop dword eax
    pop dword ebx
    pop dword ecx
    pop dword edx
    pop ds
    iret

current: dd 0
src_loc: dd 0

align 4
lidt_48:
    dw 256*8-1
    dd idt
lgdt_48:
    dw end_gdt-gdt-1
    dd gdt

align 8
idt:
    times 256 dq 0
gdt:
    dq 0x0000000000000000
    dq 0x00c09a00000007ff   ;0x08 这两个段描述符和loader.asm中的代码段数据段是一样的
    dq 0x00c09200000007ff   ;0x10
    dq 0x00c0920b80000002   ;0x18 显存数据段
    dw 0x68, tss0, 0xe900, 0x0
    dw 0x40, ldt0, 0xe200, 0x0
    dw 0x68, tss1, 0xe900, 0x0
    dw 0x40, ldt1, 0xe200, 0x0

end_gdt:

    times 128 dd 0
init_stack:         ;从这里开始是一个48位操作数
    dd init_stack   ;32位代表初始的esp
    dw 0x10         ;16位栈的段选择符，lss之后会加载到ss中

align 8
ldt0:
    dq 0x0000000000000000
    dq 0x00c0fa00000003ff
    dq 0x00c0f200000003ff

tss0:
    dd 0
    dd krn_stk0, 0x10
    dd 0, 0, 0, 0, 0
    dd 0, 0, 0, 0, 0
    dd 0, 0, 0, 0, 0
    dd 0, 0, 0, 0, 0, 0
    dd LDT0_SEL, 0x8000000

    times 128 dd 0
krn_stk0:

align 8
ldt1:
    dq 0x0000000000000000
    dq 0x00c0fa00000003ff
    dq 0x00c0f200000003ff

tss1:
    dd 0
    dd krn_stk1, 0x10
    dd 0, 0, 0, 0, 0
    dd task1, 0x200     ;0x200 eflags IF=1
    dd 0, 0, 0, 0
    dd usr_stk1, 0, 0, 0
    dd 0x17, 0x0f, 0x17, 0x17, 0x17, 0x17
    dd LDT1_SEL, 0x8000000

    times 128 dd 0
krn_stk1:


task0:
    mov dword eax, 0x17
    mov ds, ax
    mov byte al, 65
    int 0x80
    mov dword ecx, 0xfff
task0_loop:
    loop task0_loop
    jmp task0

task1:
    mov byte al, 66
    int 0x80
    mov dword ecx, 0xfff
task1_loop:
    loop task1_loop
    jmp task1

    times 128 dd 0
usr_stk1: