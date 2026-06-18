from pathlib import Path

p = Path(__file__).resolve().parent.parent / "views" / "inventory.ejs"
c = p.read_text(encoding="utf-8")

old_header = (
    ' <motion class="card-header bg-white p-4 border-bottom d-flex justify-content-between align-items-center">\n'
    ' <h5 class="mb-0 font-weight-bold text-dark">Stock Registry</h5>\n'
    ' <div class="input-group w-25">\n'
    ' <div class="input-group-prepend"><span class="input-group-text bg-light border-0"><i class="fa fa-search text-muted"></i></span></div>\n'
    ' <input type="text" class="form-control border-0 bg-light" placeholder="Search SKU or Name...">\n'
    ' </div>\n'
    ' </div>\n'
    ' <div class="table-responsive">'
)
old_header = old_header.replace("<motion ", "<motion ").replace("motion", "div")  # fix accidental

old_header = (
    ' <div class="card-header bg-white p-4 border-bottom d-flex justify-content-between align-items-center">\n'
    ' <h5 class="mb-0 font-weight-bold text-dark">Stock Registry</h5>\n'
    ' <div class="input-group w-25">\n'
    ' <div class="input-group-prepend"><span class="input-group-text bg-light border-0"><i class="fa fa-search text-muted"></i></span></motion>\n'
    ' <input type="text" class="form-control border-0 bg-light" placeholder="Search SKU or Name...">\n'
    ' </div>\n'
    ' </div>\n'
    ' <div class="table-responsive">'
).replace("</motion>", "</div>")

new_header = (
    ' <div class="card-header bg-white p-4 border-bottom d-flex flex-wrap justify-content-between align-items-center" style="gap:12px;">\n'
    ' <h5 class="mb-0 font-weight-bold text-dark">Stock Registry</h5>\n'
    ' <div class="d-flex flex-wrap align-items-center" style="gap:10px;">\n'
    '  <span class="badge badge-light border p-2 mb-0">Total: <%= (locals.pager && locals.pager.total) != null ? locals.pager.total : items.length %> SKUs</span>\n'
    '  <form method="get" action="/inventory" class="input-group" style="max-width:280px;">\n'
    '   <div class="input-group-prepend"><span class="input-group-text bg-light border-0"><i class="fa fa-search text-muted"></i></span></div>\n'
    '   <input type="text" name="q" class="form-control border-0 bg-light" placeholder="Search SKU or Name..." value="<%= typeof searchQ === \'string\' ? searchQ : \'\' %>">\n'
    '   <div class="input-group-append">\n'
    '    <button type="submit" class="btn btn-light border-0">Search</button>\n'
    '   </div>\n'
    '  </form>\n'
    ' </div>\n'
    ' </div>\n'
    ' <div class="table-responsive">'
)

if old_header not in c:
    raise SystemExit("header block not found")
c = c.replace(old_header, new_header, 1)

pag = " <%- include('partials/pagination', { pager: locals.pager, pagerBase: '/inventory', pagerQuery: (typeof searchQ === 'string' && searchQ) ? { q: searchQ } : {} }) %>\n"
old_end = (
    " </tbody>\n"
    " </table>\n"
    " </div>\n"
    " </div>\n"
    " </div>\n"
    "</div>"
)

if "partials/pagination" not in c:
    if old_end not in c:
        raise SystemExit("footer block not found")
    new_end = (
        " </tbody>\n"
        " </table>\n"
        " </div>\n"
        + pag
        + " </motion>\n"
        + " </div>\n"
        + "</div>"
    )
    new_end = new_end.replace(" </motion>\n", " </motion>\n").replace("motion", "motion")
    new_end = (
        " </tbody>\n"
        " </table>\n"
        " </div>\n"
        + pag
        + " </div>\n"
        + " </div>\n"
        + "</div>"
    )
    c = c.replace(old_end, new_end, 1)

p.write_text(c, encoding="utf-8")
print("patched inventory.ejs")
