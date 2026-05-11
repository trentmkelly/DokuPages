# Migration-style ACL combinations collected to exercise DokuWiki ACL edge cases.
*                       @ALL            0
wiki:*                  @ALL            1
wiki:team:*             @editors        2
wiki:team:launch        bob%2dsmith     16
wiki:team:launch        @qa%20team      8
wiki:locked:*           @ALL            0
wiki:locked:exception   @reviewers      2
users:%USER%:*          %USER%          16
teams:%GROUP%:*         %GROUP%         8
wiki:admin:*            @ops            255
