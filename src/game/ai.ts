export const Static = `
mov $ne $tgt
`

export const Defensive = `
sub $ne $hb $d
vlen $d $d
sub $d 8 $d
jlz $d @defend

mov $hb $dst
mov null $tgt
ret

@defend
mov $ne $dst
mov $ne $tgt
ret
`

export const StaticThenAttack = `
mov null $tgt
mov null $dst

; Defensive
sub $id 5 $o
jlz $o @defend
sub $t 20 $o
jgz $o @t1
jmp @defend

; Attack neutral
@t1
sub $t 45 $o
jgz $o @t2
    mov $nnb $dst
    jmp @attack

; Return to base
@t2
sub $t 90 $o
jgz $o @t3
    mov $hb $dst
    jmp @attack

; Attack enemy
@t3
    mov $eb $dst
    jmp @attack


@defend
    rand $x
    rand $y
    push $x $y $z
    sub $z 0.5,0.5 $z
    mul $z 2,2 $z
    add $z $hb $dst
    ;mov $hb $dst
    mov $ne $tgt
    ret

@attack
    mov 1000 $dne
    jez $ne @no-ne
    sub $ne $pos $dne
    vlen $dne $dne
    @no-ne
    sub $eb $pos $deb
    vlen $deb $deb

    sub $deb $dne $z
    jlz $z @attack-eb
    mov $ne $tgt
    ret
    @attack-eb
    mov $eb $tgt
    ret
`
