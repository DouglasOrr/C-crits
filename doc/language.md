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

**`add`**, **`sub`**, **`mul`**, **`div`**

Add/subtract/multiply/divide the number or vector in the first argument with the second argument.

```
add 1,2 $x $y    ; add `[1,2]` to $x and store the result in $y
sub $x 3.45 $x   ; subtract 3.45 from $x$ and store the result back in $x
```

## Special registers

| Register    | Direction | Type            | Description                                                                                         |
| ----------- | --------- | --------------- | --------------------------------------------------------------------------------------------------- |
| **`$id`**   | R         | `number`        | critter ID (unique, starting from 0)                                                                |
| **`$pos`**  | R         | `number`        | current critter position                                                                            |
| **`$tgt`**  | R/W       | `x,y` \| `null` | set to non-null to attack that position, if currently in range (this takes precedence over `$dest`) |
| **`$dest`** | R/W       | `x,y` \| `null` | set to non-null to move to that position                                                            |
