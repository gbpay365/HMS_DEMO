'use strict';
const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '../views/portal/dashboard.ejs');
let s = fs.readFileSync(p, 'utf8');
const oldStart = s.indexOf('  <div class="pp-book-hero">');
if (oldStart < 0) {
  console.error('start not found');
  process.exit(1);
}
const bookCard = -1;
const altBook = s.indexOf('  <div class="pp-card pp-book-card">', oldStart);
const cardIdx = bookCard >= 0 ? bookCard : altBook;
const nextCard = s.indexOf('  <div class="pp-card">', cardIdx + 10);
if (cardIdx < 0 || nextCard < 0) {
  console.error('end not found', cardIdx, nextCard);
  process.exit(1);
}
const insert = `  <div class="pp-book-launch">
   <div>
    <h2>Online appointment booking</h2>
    <p>Select department, physician, and an available time slot. Your request is reviewed and confirmed by the clinic.</p>
   </div>
   <button type="button" class="pp-book-launch-btn" id="pp-open-booking">
    <i class="fa fa-calendar-plus-o mr-1"></i> Book appointment
   </button>
  </div>

  <%- include('../partials/portal-booking-wizard') %>

`;
s = s.slice(0, oldStart) + insert + s.slice(nextCard);
fs.writeFileSync(p, s);
console.log('patched');
