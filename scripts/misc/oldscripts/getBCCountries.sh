#!/bin/bash
blue='\033[0;34m'
yellow='\033[1;33m'
green='\033[0;32m'
red='\033[0;31m'
NC='\033[0m' # No Color

alphabetical='^[0-9]+$'

lastEntry="t"

while read line
do


firstWord=`echo $line  | grep -Eo '^[^ ]+' | grep -oP '.*?(?=\.|$)' | head -n 1`

if [[ $firstWord =~ $alphabetical ]] ; then
currentYear=$firstWord

elif [[ $line == \#*-* ]] ; then

precurrentProvinceId=`echo $line  | grep -oP '.*?(?= - )' | sed  's/[^0-9]//g'`

precurrentProvinceId=`head -$precurrentProvinceId definition.csv | tail -1  | awk  -F';' '{ print $5; }'`

  if [[ $precurrentProvinceId != "" ]] ; then

  currentProvinceId=$precurrentProvinceId
  echo newSection: $currentProvinceId $waitingToWrite
  echo -e $waitingToWrite >> provinceHistory.csv

  #setdefault
  curCulture="na"
  curReligion="na"
  curCapital="na"
  curOwner="na"
  curController="na"
  curCitysize=1000
  currentYear=-2000

  fi
fi


if [[ $line == *culture* ]] ; then

curCulture=`echo $line  | grep -oP '(?<=culture \= ).*(?=$)' |  grep -oP '^\S*'`
#curCulture=$line
fi
if  [[ $line == *religion* ]] ; then

curReligion=`echo $line  | grep -oP '(?<=religion \= ).*(?=$)' |  grep -oP '^\S*'`
fi
if  [[ $line == *capital* ]] ; then

curCapital=`echo $line  | grep -oP 'capital = "\K[^"\047]+(?=["\047])'`
fi
if  [[ $line == *owner* ]] ; then

curOwner=`echo $line  | grep -oP '(?<=owner \= ).*(?=$)' |  grep -oP '^\S*'`
fi
if  [[ $line == *controller* ]] ; then

curController=`echo $line  | grep -oP '(?<=controller \= ).*(?=$)' |  grep -oP '^\S*'`
fi
if  [[ $line == *citysize* ]] ; then

curCitysize=`echo $line  | grep -oP '(?<=citysize \= ).*(?=$)' |  grep -oP '^\S*'`

fi

newLine=`echo $currentProvinceId"\t"$currentYear"\t"$curCulture"\t"$curReligion"\t"$curCapital"\t"$curOwner"\t"$curController"\t"$curCitysize`
newLineMinusYear=`echo $currentProvinceId $curCulture $curReligion $curCapital $curOwner $curController $curCitysize`

if [ "$lastEntry" != "$newLineMinusYear" ] ; then

#echo $currentYear $lastEntry
#echo $currentYear $newLineMinusYear
#echo $currentYear -gt $blockingYear

if [[ $currentYear -gt $blockingYear ]] ; then

echo -e $waitingToWrite >> provinceHistory.csv

fi

waitingToWrite=$newLine
blockingYear=$currentYear
lastEntry=$newLineMinusYear


fi

#updateattributes
#if no keyword found, echo line


#writeToTable
#id,year,attr..

done </home/daumann/code/chronas-api/scripts/misc/oldscripts/compilationNew.txt


echo -e $waitingToWrite >> provinceHistoryBC.csv
