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

A statement is a instruction followed by arguments. Each argument can be a **literal** or a **register** reference.

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
- An array of numbers separated by `,` and with an optional trailing `,`, such as `1,2`, `1,` (one element) or `,` (empty array).
- A label, such as `@return_home`.
- The special literal `null`.

## Arithmetic instructions

**`mov`**

Copy the value of the first argument to the second argument.

```
mov 1,2 $dest ; copy the literal `[1,2]` to the register `dest`
```

**`add`**, **`sub`**, **`mul`**, **`div`**, **`mod`**

Add/subtract/multiply/divide/modulo the number or vector in the first argument with the second argument.

```
add 1,2 $x $y    ; add `[1,2]` to $x and store the result in $y
sub $x 3.45 $x   ; subtract 3.45 from $x$ and store the result back in $x
```

**`rand`**

Generate a random number between 0 (inclusive) and 1 (exclusive).

```
rand $x   ; $x contains a random number in [0, 1)
```

## Array instructions

**`push`**

Concatenate or append the second argument to the first argument.

```
push 1 2 $x           ; $x contains 1,2
push 10,20 30,40 $x   ; $x contains 10,20,30,40
```

**`get`**

Extract an element from an array, based on index (`GET array index dest`).

```
get 11,12,13 1 $x   ; $x contains 12
```

**`vlen`**

Get the Euclidean length of a vector.

```
vlen 3,4 $x   ; $x contains 5
```

**`vdir`**

Get the direction of a vector, in radians (0 = north, 1.57 = east).

```
vdir 1,1 $x   ; $x contains 0.785
```

**`unitv`**

Get the unit vector for a given direction.

```
unitv 3.1415 $x   ; $x contains [0, -1]
```

## Control flow instructions

**`ret`**

End execution of the program.

```
ret
; nothing executed after `ret`
```

**`jmp`**

Jump to the label determined by the first argument.

```
jmp @return_home   ; jump to the instruction following `@return_home`
jmp $nextLabel     ; jump to the label stored in $nextLabel
```

**`jez`**, **`jlz`**, **`jgz`**

Conditional jump based on the value of the first argument. The second argument is the label to jump to. If the jump isn't taken, continue to the next instruction.

```
jez $patience @return_home  ; jump to `@return_home` if $patience is 0 (or 0,0)
```

## Special registers

| Register     | Direction | Type               | Description                                                                                         |
| ------------ | --------- | ------------------ | --------------------------------------------------------------------------------------------------- |
| **`$state`** | R/W       | `@label` \| `null` | start point for the next update                                                                     |
| **`$dest`**  | R/W       | `x,y` \| `null`    | set to non-null to move to that position                                                            |
| **`$tgt`**   | R/W       | `x,y` \| `null`    | set to non-null to attack that position, if currently in range (this takes precedence over `$dest`) |
|              |           |                    |                                                                                                     |
| **`$id`**    | R         | `number`           | critter ID (unique, starting from 0)                                                                |
| **`$pos`**   | R         | `number`           | current critter position                                                                            |
| **`$ne`**    | R         | `x,y`              | nearest enemy critter position                                                                      |
| **`$hb`**    | R         | `x,y`              | home base position                                                                                  |
| **`$eb`**    | R         | `x,y`              | enemy base position                                                                                 |
| **`$mark`**  | R         | `x,y` \| `null`    | user-controlled marker                                                                              |
| **`$hlth`**  | R         | `number`           | critter health                                                                                      |
