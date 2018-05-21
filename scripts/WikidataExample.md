https://query.wikidata.org/

https://www.wikidata.org/wiki/Wikidata:Tools/External_tools

https://tools.wmflabs.org/wikidata-todo/tempo_spatial_display.html?q=Q8676

https://query.wikidata.org/sparql?format=json&query=SELECT%20%3Fitem%20WHERE%20%7B%20%3Fitem%20(wdt%3AP361)*%20wd%3AQ46083%20%7D


### get all wikidata items instance of war
SELECT ?item WHERE {
  ?item wdt:P31 ?sub0 .
  ?sub0 (wdt:P279)* wd:Q198 .
  ?item wdt:P580 [] .
}

https://query.wikidata.org/sparql?format=json&query=SELECT+DISTINCT+%3Fitem+WHERE+%7B%0A++%3Fitem+wdt:P31+%3Fsub0+.%0A++%3Fsub0+(wdt:P279)*+wd:Q198+.%0A++%3Fitem+wdt:P580+%5B%5D+.%0A%7D+.%0A++%3Fitem+wdt:P710+%5B%5D+.%0A%7D

---

https://query.wikidata.org/sparql?format=json&query=SELECT+DISTINCT+%3Fitem+WHERE+%7B%0A++%3Fitem+wdt:P31+wd:Q198+.%0A++%3Fitem+wdt:P580+%5B%5D+.%0A++%3Fitem+wdt:P710+%5B%5D+.%0A%7D
https://query.wikidata.org/sparql?format=json&query=SELECT+DISTINCT+?item+WHERE+{
++?item+wdt:P31+wd:Q198+.
++?item+wdt:P580+[]+.
++?item+wdt:P710+[]+.
}

instance of war (198) with startime and participants 

___

https://query.wikidata.org/sparql?format=json&query=SELECT+DISTINCT+?item+WHERE+{++?item+wdt:P361+wd:Q559181+.}

get all items which are part of (check battles)

part of (P361)
instance of (P31)
has part (P527)

---

#Get all items with "roman empire" in the item label
SELECT DISTINCT ?item ?itemLabel WHERE {
  ?item rdfs:label ?itemLabel.
  OPTIONAL {  }
  FILTER(CONTAINS(LCASE(?itemLabel), "roman empire"))
  FILTER((LANG(?itemLabel)) = "en")
}
LIMIT 4

---

iterate 50 items each
https://www.wikidata.org/w/api.php?action=wbgetentities&cache=true&format=json&ids=Q68969%7CQ74109%7CQ74298%7CQ74302%7CQ74623%7CQ75626%7CQ75665%7CQ75756%7CQ76118%7CQ79791%7CQ80330%7CQ82664%7CQ83085%7CQ94916%7CQ120843%7CQ122100%7CQ123070%7CQ123210%7CQ127751%7CQ129124%7CQ129864%7CQ134949%7CQ146966%7CQ151616%7CQ151622%7CQ151663%7CQ154697%7CQ154940%7CQ154981%7CQ157548%7CQ159950%7CQ163476%7CQ164432%7CQ165136%7CQ166001%7CQ168442%7CQ170314%7CQ170682%7CQ172068%7CQ177918%7CQ178687%7CQ179077%7CQ179250%7CQ179275%7CQ181533%7CQ182865%7CQ184183%7CQ184425%7CQ184637%7CQ185729&languages=en%7Cfr&props=labels%7Csitelinks%7Cclaims&callback=angular.callbacks._0

participant
