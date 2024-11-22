export const Defensive = `
sub $ne $hb $d
vlen $d $d
sub $d 10 $d
jlz $d @defend

mov $hb $dest
mov null $tgt
ret

@defend
mov $ne $dest
mov $ne $tgt
ret
`
