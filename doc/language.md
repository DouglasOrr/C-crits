# crasm language reference

## Language

**Program**

A program is a sequence of statements and labels, separated by newlines.

```
@maybe_attack
sub $ne $pos $ne_direction
vlen $ne_direction $d
sub $d 10 $d
jlz $d @attack
@advance
mov $ne $dest
```

**Comments**

Comments start with `;` and continue until the end of the line.

```
mov 1,2 $dest ; set dest to [1, 2]
; empty line with comment
```

**Statements**

A statement is a instruction followed by arguments. Each argument can be a literal or a register reference.

```
mov 1,2 $dest  ; instruction `mov`, literal `[1,2]`, register `dest`
```

**Labels**

A label is a name preceded by `@`, such as `@return_home`. Labels are used to mark a position in the program.

```
@return_home
mov $home $dest
ret
```

**Literals**

A literal can be:

- A number, such as `1` or `2.3`.
- A list of numbers separated by `,` and with an optional trailing `,`, such as `1,2`, `1,` (one element) or `,` (empty list).
- A label, such as `@return_home`.
- The special literal `null`.

## Commands

**`mov`**

Copy the value of the first argument to the second argument.

```
mov 1,2 $dest ; copy the literal `[1,2]` to the register `dest`
```

**`ret`**

End execution of the program.

```
ret
; nothing executed after `ret`
```

## Special registers

**`$tgt`** (R/W) - set to non-null to attack that position, if currently in range (this takes precedence over `$dest`)

**`$dest`** (R/W) - set to non-null to move to that position
