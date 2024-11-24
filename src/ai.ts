export const Defensive = `
sub $ne $hb $d
vlen $d $d
sub $d 10 $d
jlz $d @defend

mov $hb $dst
mov null $tgt
ret

@defend
mov $ne $dst
mov $ne $tgt
ret
`
