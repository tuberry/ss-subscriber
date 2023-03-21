// vim:fdm=syntax
// by tuberry
'use strict';

const { Gio } = imports.gi;

const add = ([a, b], [c, d]) => [a + c, b + d];
const det = ([a, b], [c, d]) => a * d - b * c;
const sub = ([a, b], [c, d]) => [a - c, b - d];
const met = (m, n, p, q) => {
    let d = sub(m, n),
        e = sub(p, q),
        t = det(sub(m, p), e) / det(d, e);
    if(t < 0 || t > 1) return;
    return [m[0] - d[0] * t, m[1] - d[1] * t];
};

const L = 16;
const n = 0; // n = 1 / 16;
const m = n * L;
const W = L - 2 * m;
const fill = 'fill="#444"';

let a = [1, 0],
    b = [0, 1 / 2],
    c = [3 / 4, 3 / 4],
    d = [1 / 20, 1],
    e = [0, 17 / 20],
    f = [1, 1 / 20],
    A = met(b, c, e, f),
    B = met(a, d, e, f),
    C = met(b, c, a, d),
    D = [C[0], 1],
    E = add(C, [0, 1 / 16]),
    F = met(E, add(c, [0, 1 / 16]), a, D),
    p = x => x.map(y => m + y * W).join(' ');

Gio.File.new_for_path(ARGV.join('/')).replace_contents(`<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${L}" version="1.1">
 <polygon points="${p(a)} ${p(b)} ${p(A)} ${p(B)} ${p(C)} ${p(c)}" ${fill}/>
 <polygon points="${p(D)} ${p(E)} ${p(F)}" ${fill}/>
</svg>`, null, false, Gio.FileCreateFlags.NONE, null);
