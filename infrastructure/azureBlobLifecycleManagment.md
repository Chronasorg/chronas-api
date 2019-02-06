Script to routade the blogs https://docs.microsoft.com/en-us/azure/storage/blobs/storage-lifecycle-management-concepts

```JSON
{
  "version": "0.5",
  "rules": [ 
    {
      "name": "expirationRule", 
      "type": "Lifecycle", 
      "definition": 
        {
          "filters": {
            "blobTypes": [ "blockBlob" ]
          },
          "actions": {
            "baseBlob": {
              "delete": { "daysAfterModificationGreaterThan": 30 }
            }
          }
        }      
    }
  ]
}
```
