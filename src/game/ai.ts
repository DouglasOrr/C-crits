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
sub $time 20 $o
jgz $o @t1
jmp @defend

; Attack neutral
@t1
sub $time 45 $o
jgz $o @t2
    mov $nnb $dst
    jmp @attack

; Return to base
@t2
sub $time 90 $o
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

export const SurvivalWaves = `
mov null $dst
mov null $tgt
mov 3,20 $left
mov 27,20 $right

; Timer
sub $time 25 $o
    jlz $o @take_neutral
sub $time 50 $o
    mov $left $waypoint
    jlz $o @attack
sub $time 85 $o
    mov $right $waypoint
    jlz $o @attack
mod $id 2 $z
mov $left $waypoint
jez $z @skip-left
mov $right $waypoint
@skip-left
jmp @attack

; Programs
@take_neutral
    sub $nnb $hb $d
    vlen $d $d
    sub $d 16 $d
    jgz $d @go_home
    mov $nnb $dst
    mov $ne $tgt
    ret

@attack
    jez $reached-waypoint @go_to_waypoint
    mov $eb $dst
    mov $ne $tgt
    sub $eb $pos $d
    vlen $d $d
    sub $d 2 $d
    jgz $d @done
    mov $eb $tgt
    ret

@go_to_waypoint
    mov $waypoint $dst
    sub $waypoint $pos $d
    vlen $d $d
    sub $d 3 $d
    jgz $d @done
    mov 1 $reached-waypoint
    ret

@go_home
    mov $hb $dst
    ret

@done
    ret
`

export const MadnessAggressive = `
mov null $tgt
jez $ne @move-attack-base

; If there's a critter near to our base, defend
sub $ne $hb $z
vlen $z $z
sub $z 8 $z
jlz $z @defend

; If we're weak, defend
sub $fcc 5 $z
jlz $z @defend

; Attack the nearest neutral base, or enemy base if there are no neutrals
jez $nnb @dst-eb
send 0 $nnb $dst
jmp @attack
@dst-eb
send 0 $eb $dst
jmp @attack

@defend
  send 1 $hb $dst
  mov $ne $tgt
  ret

@attack
  mov null $tgt
  rand $z
  sub $z 0.1 $z
  jlz $z @done

  sub $ne $pos $z
  vlen $z $z
  sub $z 3 $z
  jgz $z @attack-base
  mov $ne $tgt
  ret

@move-attack-base
  send 0 $eb $dst
@attack-base
  mov $eb $tgt
  jez $ne @done
  sub $ne $pos $z
  vlen $z $z
  sub $z 3 $z
  jgz $z @done
  mov $ne $tgt
  ret

@done
  ret
`
