// The Agpeya (Coptic Book of Hours): each hour's Psalms (Coptic/Septuagint numbering) and readings,
// following copticchurch.net/liturgy/agpeya. Text comes from this app's LXX2012 and WEB.
// psalm: [Agpeya number, English number label, chapter in this edition, first verse, last verse].
// The Agpeya's Psalms 114 and 115 are English Psalm 116, which this edition prints as Psalm 115.
window.AGPEYA = {
  opening: ["lords-prayer", "thanksgiving", "psalm51"],
  closing: ["kyrie", "trisagion", "glory", "theotokos", "lords-prayer"],
  hours: [
    {id: "prime", name: "Prime", hour: "First Hour", time: "6 a.m.", from: 5, to: 8,
      epistle: ["EPH", 4, 1, 5],
      psalms: [[1, "1"], [2, "2"], [3, "3"], [4, "4"], [5, "5"], [6, "6"], [8, "8"], [11, "12"], [12, "13"], [14, "15"], [15, "16"], [18, "19"], [24, "25"], [26, "27"], [62, "63"], [66, "67"], [69, "70"], [112, "113"], [142, "143"]],
      gospel: [["JHN", 1, 1, 17]]},
    {id: "terce", name: "Terce", hour: "Third Hour", time: "9 a.m.", from: 8, to: 11,
      psalms: [[19, "20"], [22, "23"], [23, "24"], [25, "26"], [28, "29"], [29, "30"], [33, "34"], [40, "41"], [42, "43"], [44, "45"], [45, "46"], [46, "47"]],
      gospel: [["JHN", 14, 26, 31], ["JHN", 15, 1, 3]]},
    {id: "sext", name: "Sext", hour: "Sixth Hour", time: "Noon", from: 11, to: 14,
      psalms: [[53, "54"], [56, "57"], [60, "61"], [62, "63"], [66, "67"], [69, "70"], [83, "84"], [84, "85"], [85, "86"], [86, "87"], [90, "91"], [92, "93"]],
      gospel: [["MAT", 5, 1, 16]]},
    {id: "none", name: "None", hour: "Ninth Hour", time: "3 p.m.", from: 14, to: 16.5,
      psalms: [[95, "96"], [96, "97"], [97, "98"], [98, "99"], [99, "100"], [100, "101"], [109, "110"], [110, "111"], [111, "112"], [112, "113"], [114, "116:1–9", 115, 1, 9], [115, "116:10–19", 115, 10, 19]],
      gospel: [["LUK", 9, 10, 17]]},
    {id: "vespers", name: "Vespers", hour: "Eleventh Hour", time: "Sunset", from: 16.5, to: 18,
      psalms: [[116, "117"], [117, "118"], [119, "120"], [120, "121"], [121, "122"], [122, "123"], [123, "124"], [124, "125"], [125, "126"], [126, "127"], [127, "128"], [128, "129"]],
      gospel: [["LUK", 4, 38, 41]]},
    {id: "compline", name: "Compline", hour: "Twelfth Hour", time: "Before sleep", from: 18, to: 23,
      psalms: [[129, "130"], [130, "131"], [131, "132"], [132, "133"], [133, "134"], [136, "137"], [137, "138"], [140, "141"], [141, "142"], [145, "146"], [146, "147:1–11"], [147, "147:12–20"]],
      gospel: [["LUK", 2, 25, 32]]},
    {id: "midnight", name: "Midnight", hour: "Three watches", time: "12 a.m.", from: 23, to: 5,
      watches: [
        {name: "First Watch", psalms: [[3, "3"], [6, "6"], [12, "13"], [69, "70"], [85, "86"], [90, "91"], [116, "117"], [117, "118"], [118, "119"]], gospel: [["MAT", 25, 1, 13]]},
        {name: "Second Watch", psalms: [[119, "120"], [120, "121"], [121, "122"], [122, "123"], [123, "124"], [124, "125"], [125, "126"], [126, "127"], [127, "128"], [128, "129"]], gospel: [["LUK", 7, 36, 50]]},
        {name: "Third Watch", psalms: [[129, "130"], [130, "131"], [131, "132"], [132, "133"], [133, "134"], [136, "137"], [137, "138"], [140, "141"], [141, "142"], [145, "146"], [146, "147:1–11"], [147, "147:12–20"]], gospel: [["LUK", 12, 32, 46]]},
      ]},
  ],
};
