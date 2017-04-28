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
    lss esp, [init_stack]
align 4
lgdt_48:
    dw end_gdt-gdt-1
    dq gdt
align 8
gdt:
    dq 0x0000000000000000
    dq 0x00c09a00000007ff   ;0x08 这两个段描述符和loader.asm中的代码段数据段是一样的
    dq 0x00c09200000007ff   ;0x10
end_gdt:
    times 128 dd 0
init_stack:         ;从这里开始是一个48位操作数
    dd init_stack   ;32位代表初始的esp
    dw 0x10         ;16位栈的段选择符，lss之后会加载到ss中

jmp $
